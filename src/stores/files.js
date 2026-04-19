import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { nanoid } from './utils'
import { useWorkspaceStore } from './workspace'
import { TEXT_FILE_READ_LIMIT_BYTES } from '../domains/files/workspaceTextFileLimits.js'
import { readWorkspaceTreeSnapshot } from '../services/workspaceSnapshotIO'
import {
  handleDeletedPathEffects,
  handleMovedPathEffects,
  handleRenamedPathEffects,
  syncSavedMarkdownLinks,
} from '../services/fileStoreEffects'
import {
  copyExternalWorkspaceFile,
  createWorkspaceFile,
  createWorkspaceFolder,
  deleteWorkspacePath as removeWorkspacePath,
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
import { basenamePath, dirnamePath } from '../utils/path'
import { t } from '../i18n'
import { useToastStore } from './toast'
import { useUxStatusStore } from './uxStatus'

function readVisibleTree(path, loadedDirs = []) {
  return invoke('read_visible_tree', { path, loadedDirs })
}

function readWorkspaceSnapshot(path, loadedDirs = []) {
  return readWorkspaceTreeSnapshot(path, loadedDirs)
}

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

  const name = path ? basenamePath(path) : 'file'
  return {
    code: 'READ_FAILED',
    raw,
    message: `Cannot load '${name}'.`,
    detail: raw.length > 160 ? `${raw.slice(0, 160)}...` : raw,
  }
}

export const useFilesStore = defineStore('files', {
  state: () => ({
    tree: [],
    flatFilesCache: [],
    flatFilesReady: false,
    treeCacheByWorkspace: {},
    expandedDirs: new Set(),
    lastWorkspaceSnapshot: null,
    fileContents: {}, // cache: path → content
    fileLoadErrors: {}, // cache: path -> { code, message, detail, raw, ... }
    draftFiles: {},
    transientCreatedFiles: new Set(), // new files that can be discarded before first explicit save
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
      this.lastWorkspaceSnapshot = {
        tree: this.tree,
        flatFiles,
      }
      this._cacheWorkspaceSnapshot(workspacePath)
    },

    _applyWorkspaceSnapshot(snapshot = {}, workspacePath = null, _options = {}) {
      const treePatch = buildTreeStatePatch(snapshot?.tree || [], { preserveFlatFiles: true })
      const flatFilesPatch = buildFlatFilesStatePatch(snapshot?.flatFiles || [])
      Object.assign(this, treePatch, flatFilesPatch)
      this.lastWorkspaceSnapshot = {
        tree: snapshot?.tree || [],
        flatFiles: snapshot?.flatFiles || [],
      }
      this._cacheWorkspaceSnapshot(workspacePath)
    },

    async readWorkspaceSnapshot(loadedDirs = []) {
      const workspacePath = useWorkspaceStore().path
      if (!workspacePath) {
        return {
          tree: [],
          flatFiles: [],
        }
      }

      const snapshot = await readWorkspaceSnapshot(workspacePath, loadedDirs)
      this._applyWorkspaceSnapshot(snapshot, workspacePath)
      return snapshot
    },

    _setFileLoadError(path, error) {
      if (!path) return
      this.fileLoadErrors[path] = parseFileReadError(path, error)
    },

    _clearFileLoadError(path) {
      if (!path || !(path in this.fileLoadErrors)) return
      delete this.fileLoadErrors[path]
    },

    _getVisibleTreeRefreshRuntime() {
      if (!this._visibleTreeRefreshRuntime) {
        this._visibleTreeRefreshRuntime = createVisibleTreeRefreshRuntime({
          getWorkspacePath: () => useWorkspaceStore().path,
          getCurrentTree: () => this.tree,
          findCurrentEntry: (path) => this._findEntry(path),
          readDirShallow: (path) => invoke('read_dir_shallow', { path }),
          readVisibleTree: (path, loadedDirs = []) => readVisibleTree(path, loadedDirs),
          readWorkspaceSnapshot: (path, loadedDirs = []) => readWorkspaceSnapshot(path, loadedDirs),
          applyWorkspaceSnapshot: (snapshot, workspacePath, options = {}) =>
            this._applyWorkspaceSnapshot(snapshot, workspacePath, options),
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

    noteTreeActivity() {
      this._getFileTreeWatchRuntime().noteTreeActivity()
    },

    _getFileTreeWatchRuntime() {
      if (!this._fileTreeWatchRuntime) {
        this._fileTreeWatchRuntime = createFileTreeWatchRuntime({
          getWorkspaceContext: () => ({ path: useWorkspaceStore().path }),
          refreshVisibleTree: (options = {}) => this.refreshVisibleTree(options),
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
          readVisibleTree: (path, loadedDirs = []) => readVisibleTree(path, loadedDirs),
          readWorkspaceSnapshot: (path, loadedDirs = []) => readWorkspaceSnapshot(path, loadedDirs),
          applyWorkspaceSnapshot: (snapshot, workspacePath, options = {}) =>
            this._applyWorkspaceSnapshot(snapshot, workspacePath, options),
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
          readWorkspaceSnapshot: (path, loadedDirs = []) => readWorkspaceSnapshot(path, loadedDirs),
          applyWorkspaceSnapshot: (snapshot, workspacePath, options = {}) =>
            this._applyWorkspaceSnapshot(snapshot, workspacePath, options),
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
          readTextFile: (path, maxBytes) => readWorkspaceTextFile(path, maxBytes),
          saveTextFile: (path, content) => saveWorkspaceTextFile(path, content),
          isBinaryPath: (path) => isBinaryFile(path),
          setFileContent: (path, content) => {
            this.fileContents[path] = content
          },
          clearFileLoadError: (path) => this._clearFileLoadError(path),
          setFileLoadError: (path, error) => this._setFileLoadError(path, error),
          syncSavedMarkdownLinks: (path) => syncSavedMarkdownLinks(path),
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
          createWorkspaceFile: (dirPath, name, options = {}) => createWorkspaceFile(dirPath, name, options),
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
            const name = basenamePath(newPath)
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
      const saved = await this._getFileContentRuntime().saveFile(path, content)
      if (saved) {
        this.transientCreatedFiles.delete(path)
      }
      return saved
    },

    setInMemoryFileContent(path, content) {
      this._getFileContentRuntime().setInMemoryFileContent(path, content)
    },

    clearInMemoryFileContent(path) {
      if (!path || !(path in this.fileContents)) return
      delete this.fileContents[path]
    },

    applyBrowserPreviewSnapshot({ snapshot = {}, fileContents = {}, expandedDirs = new Set() } = {}) {
      this.cleanup()
      const tree = Array.isArray(snapshot?.tree) ? snapshot.tree : []
      const flatFiles = Array.isArray(snapshot?.flatFiles) ? snapshot.flatFiles : []

      this.tree = tree
      this.flatFilesCache = flatFiles
      this.flatFilesReady = true
      this.lastWorkspaceSnapshot = {
        tree,
        flatFiles,
      }
      this.expandedDirs = expandedDirs instanceof Set ? new Set(expandedDirs) : new Set(expandedDirs || [])
      this.fileContents = { ...fileContents }
      this.fileLoadErrors = {}
      this.lastLoadError = null
    },

    createDraftFile(options = {}) {
      const ext = typeof options.ext === 'string' && options.ext ? options.ext : '.md'
      const suggestedName = typeof options.suggestedName === 'string' && options.suggestedName
        ? options.suggestedName
        : `Untitled${ext}`
      const initialContent = typeof options.initialContent === 'string' ? options.initialContent : ''
      const path = `draft:${nanoid()}/${suggestedName}`
      this.draftFiles[path] = {
        suggestedName,
        ext,
      }
      this.fileContents[path] = initialContent
      this._clearFileLoadError(path)
      return path
    },

    isDraftFile(path) {
      return !!path && path in this.draftFiles
    },

    getDraftSuggestedName(path) {
      return this.draftFiles[path]?.suggestedName || ''
    },

    clearDraftFile(path) {
      if (!path) return
      delete this.draftFiles[path]
      this.clearInMemoryFileContent(path)
      this._clearFileLoadError(path)
    },

    async saveDraftAs(draftPath, targetPath, content) {
      if (!draftPath || !targetPath) return false
      const saved = await this._getFileContentRuntime().saveFile(targetPath, content)
      if (!saved) return false
      const targetDir = dirnamePath(targetPath)
      await this.syncTreeAfterMutation({ expandPath: targetDir })
      this.clearDraftFile(draftPath)
      return true
    },

    async promptAndSaveDraft(draftPath, content) {
      if (!draftPath) return null
      const workspaceRoot = String(useWorkspaceStore().path || '').replace(/\/+$/, '')
      const draftName = this.getDraftSuggestedName(draftPath) || 'Untitled.md'
      const defaultPath = workspaceRoot ? `${workspaceRoot}/${draftName}` : draftName

      let selectedPath = null
      try {
        selectedPath = await saveDialog({
          title: t('Save'),
          defaultPath,
        })
      } catch {
        useToastStore().show(t('Could not open the save dialog.'), {
          type: 'error',
          duration: 4000,
        })
        return null
      }

      if (!selectedPath) return null

      if (workspaceRoot && selectedPath !== workspaceRoot && !selectedPath.startsWith(`${workspaceRoot}/`)) {
        useToastStore().show(t('Save the draft inside the current workspace.'), {
          type: 'error',
          duration: 4000,
        })
        return null
      }

      const saved = await this.saveDraftAs(draftPath, selectedPath, content)
      return saved ? selectedPath : null
    },

    markTransientFile(path) {
      if (!path) return
      this.transientCreatedFiles.add(path)
    },

    clearTransientFile(path) {
      if (!path) return
      this.transientCreatedFiles.delete(path)
    },

    isTransientFile(path) {
      return !!path && this.transientCreatedFiles.has(path)
    },

    async createFile(dirPath, name, options = {}) {
      return this._getFileCreationRuntime().createFile(dirPath, name, options)
    },

    async duplicatePath(path) {
      return this._getFileCreationRuntime().duplicatePath(path)
    },

    async createFolder(dirPath, name) {
      return this._getFileCreationRuntime().createFolder(dirPath, name)
    },

    async renamePath(oldPath, newPath) {
      const renamed = await this._getFileMutationRuntime().renamePath(oldPath, newPath)
      if (renamed && this.transientCreatedFiles.has(oldPath)) {
        this.transientCreatedFiles.delete(oldPath)
        this.transientCreatedFiles.add(newPath)
      }
      return renamed
    },

    async movePath(srcPath, destDir) {
      return this._getFileMutationRuntime().movePath(srcPath, destDir)
    },

    async copyExternalFile(srcPath, destDir) {
      return this._getFileCreationRuntime().copyExternalFile(srcPath, destDir)
    },

    async deletePath(path) {
      const deleted = await this._getFileMutationRuntime().deletePath(path)
      if (deleted) {
        this.transientCreatedFiles.delete(path)
      }
      return deleted
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
      this.lastWorkspaceSnapshot = null
      this.expandedDirs = new Set()
      this.fileContents = {}
      this.fileLoadErrors = {}
      this.draftFiles = {}
      this.transientCreatedFiles = new Set()
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
