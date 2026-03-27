import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useWorkspaceStore } from './workspace'
import { TEXT_FILE_READ_LIMIT_BYTES } from '../domains/files/workspaceTextFileLimits.js'
import {
  handleDeletedPathEffects,
  handleExternalFileChanges,
  handleMovedPathEffects,
  handleRenamedPathEffects,
  syncSavedMarkdownLinks,
} from '../services/fileStoreEffects'
import {
  copyExternalWorkspaceFile,
  createWorkspaceFile,
  createWorkspaceFolder,
  deleteWorkspacePath as removeWorkspacePath,
  detectPdfSourceKind,
  duplicateWorkspacePath,
  moveWorkspacePath as relocateWorkspacePath,
  readWorkspaceTextFile,
  renameWorkspacePath as renameWorkspaceEntry,
  saveWorkspaceTextFile,
} from '../services/fileStoreIO'
import {
  buildFlatFilesStatePatch,
  buildRestoredCachedTreeState,
  buildTreeStatePatch,
  buildWorkspaceTreeCacheSnapshot,
  replayCachedExpandedDirs,
} from '../domains/files/fileTreeCacheRuntime'
import {
  createVisibleTreeRefreshRuntime,
} from '../domains/files/fileTreeRefreshRuntime'
import { createFileTreeWatchRuntime } from '../domains/files/fileTreeWatchRuntime'
import {
  createFileTreeHydrationRuntime,
  findTreeEntry,
} from '../domains/files/fileTreeHydrationRuntime'
import { createFlatFilesIndexRuntime } from '../domains/files/flatFilesIndexRuntime'
import { createFileContentRuntime } from '../domains/files/fileContentRuntime'
import { createFileCreationRuntime } from '../domains/files/fileCreationRuntime'
import { createFileMutationRuntime } from '../domains/files/fileMutationRuntime'
import { formatFileError } from '../utils/errorMessages'
import { isBinaryFile } from '../utils/fileTypes'
import { t } from '../i18n'
import { useToastStore } from './toast'
import { useUxStatusStore } from './uxStatus'

function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function parseFileReadError(path, error) {
  const raw = typeof error === 'string' ? error : String(error || 'Unknown error')
  const tooLargeMatch = raw.match(/^FILE_TOO_LARGE:(\d+):(\d+)$/)
  if (tooLargeMatch) {
    const maxBytes = Number.parseInt(tooLargeMatch[1], 10)
    const actualBytes = Number.parseInt(tooLargeMatch[2], 10)
    return {
      code: 'FILE_TOO_LARGE',
      raw,
      maxBytes,
      actualBytes,
      message: `This file is too large to open as text (${formatBytes(actualBytes)} > ${formatBytes(maxBytes)}).`,
      detail: 'Open it externally or reduce the file size, then try again.',
    }
  }

  const name = path ? path.split('/').pop() : 'file'
  return {
    code: 'READ_FAILED',
    raw,
    message: `Cannot load '${name}'.`,
    detail: raw.length > 160 ? `${raw.slice(0, 160)}...` : raw,
  }
}

async function extractPdfTextLazily(path) {
  const { extractTextFromPdf } = await import('../utils/pdfMetadata.js')
  return extractTextFromPdf(path)
}

export const useFilesStore = defineStore('files', {
  state: () => ({
    tree: [],
    flatFilesCache: [],
    flatFilesReady: false,
    treeCacheByWorkspace: {},
    expandedDirs: new Set(),
    fileContents: {}, // cache: path → content
    fileLoadErrors: {}, // cache: path -> { code, message, detail, raw, ... }
    pdfSourceKinds: {}, // cache: pdf path -> { status, kind }
    deletingPaths: new Set(), // paths currently being deleted (prevents save-on-unmount race)
    lastLoadError: null,
    reconcileState: {
      inProgress: false,
      reason: '',
      lastStartedAt: 0,
      lastCompletedAt: 0,
      lastError: '',
    },
  }),

  getters: {
    // Flat list of all files for search
    flatFiles: (state) => state.flatFilesCache,
    getFileLoadError: (state) => (path) => state.fileLoadErrors[path] || null,
    getPdfSourceState: (state) => (path) => state.pdfSourceKinds[path] || null,
  },

  actions: {
    _cacheWorkspaceSnapshot(workspacePath = null) {
      const targetWorkspace = workspacePath || useWorkspaceStore().path
      if (!targetWorkspace) return
      this.treeCacheByWorkspace[targetWorkspace] = buildWorkspaceTreeCacheSnapshot({
        tree: this.tree,
        expandedDirs: this.expandedDirs,
      })
    },

    _setTree(tree = [], workspacePath = null, options = {}) {
      Object.assign(this, buildTreeStatePatch(tree, options))
      this._cacheWorkspaceSnapshot(workspacePath)
    },

    _setFlatFiles(flatFiles = [], workspacePath = null) {
      Object.assign(this, buildFlatFilesStatePatch(flatFiles))
      this._cacheWorkspaceSnapshot(workspacePath)
    },

    _setFileLoadError(path, error) {
      if (!path) return
      this.fileLoadErrors[path] = parseFileReadError(path, error)
    },

    _clearFileLoadError(path) {
      if (!path || !(path in this.fileLoadErrors)) return
      delete this.fileLoadErrors[path]
    },

    _setPdfSourceState(path, state) {
      if (!path) return
      this.pdfSourceKinds[path] = state
    },

    _getVisibleTreeRefreshRuntime() {
      if (!this._visibleTreeRefreshRuntime) {
        this._visibleTreeRefreshRuntime = createVisibleTreeRefreshRuntime({
          getWorkspacePath: () => useWorkspaceStore().path,
          getCurrentTree: () => this.tree,
          findCurrentEntry: (path) => this._findEntry(path),
          readDirShallow: (path) => invoke('read_dir_shallow', { path }),
          applyTree: (tree, workspacePath, options = {}) => this._setTree(tree, workspacePath, options),
          setLastLoadError: (error) => {
            this.lastLoadError = error
          },
          beginReconcile: (reason, options = {}) => this._beginReconcile(reason, options),
          finishReconcile: (reason) => this._finishReconcile(reason),
          failReconcile: (reason, error, options = {}) => this._failReconcile(reason, error, options),
        })
      }
      return this._visibleTreeRefreshRuntime
    },

    invalidatePdfSourceForPath(path) {
      return this._getFileContentRuntime().invalidatePdfSourceForPath(path)
    },

    async ensurePdfSourceKind(pdfPath, options = {}) {
      return this._getFileContentRuntime().ensurePdfSourceKind(pdfPath, options)
    },

    noteTreeActivity() {
      this._getFileTreeWatchRuntime().noteTreeActivity()
    },

    _getFileTreeWatchRuntime() {
      if (!this._fileTreeWatchRuntime) {
        this._fileTreeWatchRuntime = createFileTreeWatchRuntime({
          getWorkspaceContext: () => {
            const workspace = useWorkspaceStore()
            return {
              path: workspace.path,
              workspaceDataDir: workspace.workspaceDataDir,
            }
          },
          refreshVisibleTree: (options = {}) => this.refreshVisibleTree(options),
          handleExternalFileChanges: (changedPaths) => handleExternalFileChanges(this, changedPaths),
          listenToFsChange: (handler) => listen('fs-change', handler),
          onFsEvent: (kind, paths) => {
            if (import.meta.env.DEV) {
              console.debug('[fs-watch]', kind, paths)
            }
          },
        })
      }
      return this._fileTreeWatchRuntime
    },

    _getFileTreeHydrationRuntime() {
      if (!this._fileTreeHydrationRuntime) {
        this._fileTreeHydrationRuntime = createFileTreeHydrationRuntime({
          getWorkspacePath: () => useWorkspaceStore().path,
          getCurrentTree: () => this.tree,
          readDirShallow: (path) => invoke('read_dir_shallow', { path }),
          applyTree: (tree, workspacePath, options = {}) => this._setTree(tree, workspacePath, options),
          refreshVisibleTree: (options = {}) => this.refreshVisibleTree(options),
          setLastLoadError: (error) => {
            this.lastLoadError = error
          },
          addExpandedDir: (path) => {
            this.expandedDirs.add(path)
          },
          removeExpandedDir: (path) => {
            this.expandedDirs.delete(path)
          },
          hasExpandedDir: (path) => this.expandedDirs.has(path),
          cacheSnapshot: () => this._cacheWorkspaceSnapshot(),
          invalidateFlatFiles: () => {
            this.flatFilesCache = []
            this.flatFilesReady = false
          },
        })
      }
      return this._fileTreeHydrationRuntime
    },

    _findEntry(path) {
      return findTreeEntry(this.tree, path)
    },

    restoreCachedTree(workspacePath) {
      if (!workspacePath) return false
      const patch = buildRestoredCachedTreeState(this.treeCacheByWorkspace[workspacePath])
      if (!patch) return false
      Object.assign(this, patch)
      return true
    },

    _getFlatFilesIndexRuntime() {
      if (!this._flatFilesIndexRuntime) {
        this._flatFilesIndexRuntime = createFlatFilesIndexRuntime({
          getWorkspacePath: () => useWorkspaceStore().path,
          getFlatFilesReady: () => this.flatFilesReady,
          getFlatFilesCache: () => this.flatFilesCache,
          setFlatFiles: (flatFiles, workspacePath) => this._setFlatFiles(flatFiles, workspacePath),
          markFlatFilesNotReady: () => {
            this.flatFilesReady = false
          },
          listFilesRecursive: (path) => invoke('list_files_recursive', { path }),
        })
      }
      return this._flatFilesIndexRuntime
    },

    _getFileContentRuntime() {
      if (!this._fileContentRuntime) {
        this._fileContentRuntime = createFileContentRuntime({
          getPdfSourceState: (path) => this.pdfSourceKinds[path] || null,
          setPdfSourceState: (path, state) => this._setPdfSourceState(path, state),
          clearPdfSourceState: (path) => {
            if (!path) return
            delete this.pdfSourceKinds[path]
          },
          detectPdfSourceKind: (pdfPath) => detectPdfSourceKind({
            pdfPath,
            fileContents: this.fileContents,
            findEntry: (path) => this._findEntry(path),
          }),
          readTextFile: (path, maxBytes) => readWorkspaceTextFile(path, maxBytes),
          saveTextFile: (path, content) => saveWorkspaceTextFile(path, content),
          extractPdfText: (path) => extractPdfTextLazily(path),
          isBinaryPath: (path) => isBinaryFile(path),
          setFileContent: (path, content) => {
            this.fileContents[path] = content
          },
          clearFileLoadError: (path) => this._clearFileLoadError(path),
          setFileLoadError: (path, error) => this._setFileLoadError(path, error),
          syncSavedMarkdownLinks: (path) => syncSavedMarkdownLinks(path),
          notifyPdfUpdated: (path) => {
            window.dispatchEvent(new CustomEvent('pdf-updated', {
              detail: { path },
            }))
          },
          onPdfReadError: (_path, error) => {
            console.error('Failed to extract PDF text:', error)
          },
          onSaveError: (path, error) => {
            console.error('Failed to save file:', error)
            useToastStore().showOnce(`save:${path}`, formatFileError('save', path, error), {
              type: 'error',
              duration: 5000,
            })
          },
        })
      }
      return this._fileContentRuntime
    },

    _getFileCreationRuntime() {
      if (!this._fileCreationRuntime) {
        this._fileCreationRuntime = createFileCreationRuntime({
          createWorkspaceFile: (dirPath, name) => createWorkspaceFile(dirPath, name),
          duplicateWorkspacePath: (path) => duplicateWorkspacePath(path),
          createWorkspaceFolder: (dirPath, name) => createWorkspaceFolder(dirPath, name),
          copyExternalWorkspaceFile: (srcPath, destDir) => copyExternalWorkspaceFile(srcPath, destDir),
          syncTreeAfterMutation: (options = {}) => this.syncTreeAfterMutation(options),
          ensureDirLoaded: (path, options = {}) => this.ensureDirLoaded(path, options),
          addExpandedDir: (path) => {
            this.expandedDirs.add(path)
          },
          cacheSnapshot: () => this._cacheWorkspaceSnapshot(),
          showCreateExistsError: (path, name) => {
            useToastStore().showOnce(`create:${path}`, `"${name}" already exists`, {
              type: 'error',
              duration: 4000,
            })
          },
          onCreateFileError: (dirPath, name, error) => {
            console.error('Failed to create file:', error)
            useToastStore().showOnce(`create:${dirPath}/${name}`, `"${name}" already exists`, {
              type: 'error',
              duration: 4000,
            })
          },
          onDuplicateError: (_path, error) => {
            console.error('Failed to duplicate:', error)
          },
          onCreateFolderError: (_dirPath, _name, error) => {
            console.error('Failed to create folder:', error)
          },
          onCopyExternalFileError: (_srcPath, _destDir, error) => {
            console.error('Failed to copy external file:', error)
          },
        })
      }
      return this._fileCreationRuntime
    },

    _getFileMutationRuntime() {
      if (!this._fileMutationRuntime) {
        this._fileMutationRuntime = createFileMutationRuntime({
          renameWorkspaceEntry: (oldPath, newPath) => renameWorkspaceEntry(oldPath, newPath),
          relocateWorkspacePath: (srcPath, destDir) => relocateWorkspacePath(srcPath, destDir),
          removeWorkspacePath: (path) => removeWorkspacePath(path),
          syncTreeAfterMutation: (options = {}) => this.syncTreeAfterMutation(options),
          invalidatePdfSourceForPath: (path) => this.invalidatePdfSourceForPath(path),
          handleRenamedPathEffects: (oldPath, newPath) => handleRenamedPathEffects(oldPath, newPath),
          handleMovedPathEffects: (srcPath, destPath) => handleMovedPathEffects(srcPath, destPath),
          handleDeletedPathEffects: (path) => handleDeletedPathEffects(path),
          hasFileContent: (path) => path in this.fileContents,
          getFileContent: (path) => this.fileContents[path],
          setFileContent: (path, value) => {
            this.fileContents[path] = value
          },
          deleteFileContent: (path) => {
            delete this.fileContents[path]
          },
          hasFileLoadError: (path) => path in this.fileLoadErrors,
          getFileLoadError: (path) => this.fileLoadErrors[path],
          setFileLoadError: (path, value) => {
            this.fileLoadErrors[path] = value
          },
          deleteFileLoadError: (path) => {
            delete this.fileLoadErrors[path]
          },
          hasExpandedDir: (path) => this.expandedDirs.has(path),
          addExpandedDir: (path) => {
            this.expandedDirs.add(path)
          },
          removeExpandedDir: (path) => {
            this.expandedDirs.delete(path)
          },
          addDeletingPath: (path) => {
            this.deletingPaths.add(path)
          },
          removeDeletingPath: (path) => {
            this.deletingPaths.delete(path)
          },
          showRenameExistsError: (newPath) => {
            const name = newPath.split('/').pop()
            useToastStore().showOnce(`rename:${newPath}`, `"${name}" already exists`, {
              type: 'error',
              duration: 4000,
            })
          },
          onRenameError: (_oldPath, _newPath, error) => {
            console.error('Failed to rename:', error)
          },
          onMoveError: (_srcPath, _destDir, error) => {
            console.error('Failed to move:', error)
          },
          onDeleteError: (_path, error) => {
            console.error('Failed to delete:', error)
          },
        })
      }
      return this._fileMutationRuntime
    },

    async restoreCachedExpandedDirs(workspacePath, options = {}) {
      await replayCachedExpandedDirs({
        workspacePath,
        cachedSnapshot: this.treeCacheByWorkspace[workspacePath],
        maxDirs: options.maxDirs,
        getCurrentWorkspacePath: () => useWorkspaceStore().path,
        ensureDirLoaded: (dirPath) => this.ensureDirLoaded(dirPath),
        onDirExpanded: (dirPath) => {
          this.expandedDirs.add(dirPath)
        },
        persistSnapshot: () => this._cacheWorkspaceSnapshot(workspacePath),
      })
    },

    async indexWorkspaceFiles(options = {}) {
      return this._getFlatFilesIndexRuntime().indexWorkspaceFiles(options)
    },

    async ensureFlatFilesReady(options = {}) {
      return this._getFlatFilesIndexRuntime().ensureFlatFilesReady(options)
    },

    async loadFileTree(options = {}) {
      return this._getFileTreeHydrationRuntime().loadFileTree(options)
    },

    async ensureDirLoaded(path, options = {}) {
      return this._getFileTreeHydrationRuntime().ensureDirLoaded(path, options)
    },

    async refreshVisibleTree(options = {}) {
      return this._getVisibleTreeRefreshRuntime().refreshVisibleTree(options)
    },

    async revealPath(path) {
      return this._getFileTreeHydrationRuntime().revealPath(path)
    },

    async startWatching() {
      await this._getFileTreeWatchRuntime().startWatching()
    },

    async toggleDir(path) {
      return this._getFileTreeHydrationRuntime().toggleDir(path)
    },

    isDirExpanded(path) {
      return this.expandedDirs.has(path)
    },

    async syncTreeAfterMutation(options = {}) {
      return this._getFileTreeHydrationRuntime().syncTreeAfterMutation(options)
    },

    async readFile(path, options = {}) {
      const { maxBytes = TEXT_FILE_READ_LIMIT_BYTES } = options
      return this._getFileContentRuntime().readFile(path, { maxBytes })
    },

    async reloadFile(path) {
      return this._getFileContentRuntime().reloadFile(path)
    },

    async saveFile(path, content) {
      return this._getFileContentRuntime().saveFile(path, content)
    },

    setInMemoryFileContent(path, content) {
      this._getFileContentRuntime().setInMemoryFileContent(path, content)
    },

    async createFile(dirPath, name) {
      return this._getFileCreationRuntime().createFile(dirPath, name)
    },

    async duplicatePath(path) {
      return this._getFileCreationRuntime().duplicatePath(path)
    },

    async createFolder(dirPath, name) {
      return this._getFileCreationRuntime().createFolder(dirPath, name)
    },

    async renamePath(oldPath, newPath) {
      return this._getFileMutationRuntime().renamePath(oldPath, newPath)
    },

    async movePath(srcPath, destDir) {
      return this._getFileMutationRuntime().movePath(srcPath, destDir)
    },

    async copyExternalFile(srcPath, destDir) {
      return this._getFileCreationRuntime().copyExternalFile(srcPath, destDir)
    },

    async deletePath(path) {
      return this._getFileMutationRuntime().deletePath(path)
    },

    cleanup() {
      this._fileTreeWatchRuntime?.stopWatching?.()
      this._fileTreeWatchRuntime = null
      this._flatFilesIndexRuntime?.reset?.()
      this._flatFilesIndexRuntime = null
      this._visibleTreeRefreshRuntime?.reset?.()
      this._visibleTreeRefreshRuntime = null
      this._fileTreeHydrationRuntime?.reset?.()
      this._fileTreeHydrationRuntime = null
      this._fileContentRuntime?.reset?.()
      this._fileContentRuntime = null
      this._fileMutationRuntime = null
      this.tree = []
      this.flatFilesCache = []
      this.flatFilesReady = false
      this.expandedDirs = new Set()
      this.fileContents = {}
      this.fileLoadErrors = {}
      this.pdfSourceKinds = {}
      this.lastLoadError = null
      this.reconcileState = {
        inProgress: false,
        reason: '',
        lastStartedAt: 0,
        lastCompletedAt: 0,
        lastError: '',
      }
    },

    _beginReconcile(reason = 'manual', { announce = false } = {}) {
      this.reconcileState = {
        ...this.reconcileState,
        inProgress: true,
        reason,
        lastStartedAt: Date.now(),
        lastError: '',
      }

      if (!announce) return
      if (reason === 'visibility' || reason === 'window-focus') {
        useUxStatusStore().showOnce('files-reconcile-visibility', t('Refreshing workspace state...'), {
          type: 'info',
          duration: 1800,
        }, 6000)
      }
    },

    _finishReconcile(reason = 'manual') {
      this.reconcileState = {
        ...this.reconcileState,
        inProgress: false,
        reason,
        lastCompletedAt: Date.now(),
        lastError: '',
      }
    },

    _failReconcile(reason = 'manual', error, { suppressErrors = false } = {}) {
      this.reconcileState = {
        ...this.reconcileState,
        inProgress: false,
        reason,
        lastError: error?.message || String(error || ''),
      }

      if (!suppressErrors) return

      const message = t('Workspace refresh failed. Some external changes may appear late.')
      useUxStatusStore().showOnce('files-reconcile-failed', message, {
        type: 'warning',
        duration: 5000,
      }, 12000)
      useToastStore().showOnce('files-reconcile-failed', message, {
        type: 'warning',
        duration: 6000,
      }, 12000)
    },
  },
})
