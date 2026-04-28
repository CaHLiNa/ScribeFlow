import { defineStore } from 'pinia'
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
  createWorkspaceDocumentFile,
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
  loadWorkspaceTreeState as loadWorkspaceTreeStateFromRust,
  noteWorkspaceTreeActivity as noteWorkspaceTreeActivityFromRust,
  readDirShallow,
  restoreCachedExpandedTreeState as restoreCachedExpandedTreeStateFromRust,
  revealWorkspaceTreeState as revealWorkspaceTreeStateFromRust,
  setWorkspaceTreeVisibility,
  listenWorkspaceTreeRefreshRequested,
  startWorkspaceTreeWatch,
  stopWorkspaceTreeWatch,
} from '../services/workspaceTreeRuntime'
import {
  buildFlatFilesStatePatch,
  buildRestoredCachedTreeState,
  buildTreeStatePatch,
  buildWorkspaceTreeCacheSnapshot,
} from '../domains/files/fileTreeCacheRuntime'
import { createFileContentRuntime } from '../domains/files/fileContentRuntime'
import { createFileCreationRuntime } from '../domains/files/fileCreationRuntime'
import { createFileMutationRuntime } from '../domains/files/fileMutationRuntime'
import { formatFileError } from '../utils/errorMessages'
import { isBinaryFile } from '../utils/fileTypes'
import { basenamePath, dirnamePath } from '../utils/path'
import { t } from '../i18n'
import { useToastStore } from './toast'
import { useUxStatusStore } from './uxStatus'
import { isTauriDesktopRuntime } from '../platform'

function readWorkspaceSnapshot(path, loadedDirs = []) {
  const workspace = useWorkspaceStore()
  return readWorkspaceTreeSnapshot(path, loadedDirs, {
    includeHidden: workspace.fileTreeShowHidden !== false,
  })
}

async function loadWorkspaceTreeState(currentTree = [], extraDirs = []) {
  const workspace = useWorkspaceStore()
  return loadWorkspaceTreeStateFromRust({
    workspacePath: workspace.path || '',
    currentTree,
    extraDirs,
    includeHidden: workspace.fileTreeShowHidden !== false,
  })
}

async function revealWorkspaceTreeState(targetPath = '', currentTree = []) {
  const workspace = useWorkspaceStore()
  return revealWorkspaceTreeStateFromRust({
    workspacePath: workspace.path || '',
    targetPath,
    currentTree,
    includeHidden: workspace.fileTreeShowHidden !== false,
  })
}

async function restoreCachedExpandedTreeState(currentTree = [], cachedRootExpandedDirs = [], maxDirs = 6) {
  const workspace = useWorkspaceStore()
  return restoreCachedExpandedTreeStateFromRust({
    workspacePath: workspace.path || '',
    currentTree,
    cachedRootExpandedDirs,
    maxDirs,
    includeHidden: workspace.fileTreeShowHidden !== false,
  })
}

function findTreeEntry(entries = [], targetPath) {
  for (const entry of entries) {
    if (entry.path === targetPath) return entry
    if (Array.isArray(entry.children)) {
      const found = findTreeEntry(entry.children, targetPath)
      if (found) return found
    }
  }
  return null
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
    fileContentRevisions: {}, // cache: path -> incrementing revision
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

    _bumpFileContentRevision(path) {
      if (!path) return
      const nextRevision = Number(this.fileContentRevisions[path] || 0) + 1
      this.fileContentRevisions[path] = nextRevision
    },

    _setCachedFileContent(path, content) {
      if (!path) return
      this.fileContents[path] = content
      this._bumpFileContentRevision(path)
    },

    _deleteCachedFileContent(path) {
      if (!path || !(path in this.fileContents)) return
      delete this.fileContents[path]
      this._bumpFileContentRevision(path)
    },

    _clearFileLoadError(path) {
      if (!path || !(path in this.fileLoadErrors)) return
      delete this.fileLoadErrors[path]
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

    applyBootstrapTreeState(snapshot = {}, workspacePath = null) {
      const targetWorkspace = workspacePath || useWorkspaceStore().path
      this._applyWorkspaceSnapshot(snapshot, targetWorkspace, { preserveFlatFiles: true })
      this.expandedDirs = new Set(snapshot?.expandedDirs || [])
      this._cacheWorkspaceSnapshot(targetWorkspace)
      return this.tree
    },

    _teardownNativeWatcher() {
      if (typeof this._nativeWatcherUnlisten === 'function') {
        this._nativeWatcherUnlisten()
      }
      this._nativeWatcherUnlisten = null
      if (this._nativeWatcherActive) {
        stopWorkspaceTreeWatch().catch(() => {})
      }
      this._nativeWatcherActive = false
    },

    _teardownActivityHooks() {
      if (!this._treeActivityHandlers) return
      const { focusHandler, visibilityHandler } = this._treeActivityHandlers
      window.removeEventListener('focus', focusHandler)
      document.removeEventListener('visibilitychange', visibilityHandler)
      this._treeActivityHandlers = null
    },

    _notifyTreeVisibility(visible) {
      const workspacePath = useWorkspaceStore().path
      if (!workspacePath) return
      void setWorkspaceTreeVisibility({
        path: workspacePath,
        visible: visible === true,
      }).catch(() => {})
    },

    noteTreeActivity() {
      const workspacePath = useWorkspaceStore().path
      if (!workspacePath) return
      void noteWorkspaceTreeActivityFromRust(workspacePath).catch(() => {})
    },

    _setupActivityHooks() {
      this._teardownActivityHooks()
      const focusHandler = () => this.noteTreeActivity()
      const visibilityHandler = () => {
        this._notifyTreeVisibility(document.visibilityState === 'visible')
        if (document.visibilityState === 'visible') {
          this.noteTreeActivity()
        }
      }
      this._treeActivityHandlers = { focusHandler, visibilityHandler }
      window.addEventListener('focus', focusHandler)
      document.addEventListener('visibilitychange', visibilityHandler)
    },

    async _setupNativeWatcher() {
      this._teardownNativeWatcher()

      const workspacePath = useWorkspaceStore().path
      if (!workspacePath || !isTauriDesktopRuntime()) return

      try {
        await startWorkspaceTreeWatch(workspacePath)
        this._nativeWatcherActive = true
        this._nativeWatcherUnlisten = await listenWorkspaceTreeRefreshRequested((payload) => {
          const activeWorkspacePath = useWorkspaceStore().path
          if (!activeWorkspacePath) return
          if (String(payload.workspacePath || '') !== String(activeWorkspacePath || '')) return
          if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
          void this.refreshVisibleTree({
            suppressErrors: true,
            reason: String(payload.reason || 'fs-watch'),
          }).catch(() => {
            // Workspace may have changed while the refresh event was in flight.
          })
        })
      } catch (error) {
        this._nativeWatcherUnlisten = null
        this._nativeWatcherActive = false
        console.warn('[file-tree] native workspace watcher unavailable:', error)
      }
    },

    _getFileContentRuntime() {
      if (!this._fileContentRuntime) {
        this._fileContentRuntime = createFileContentRuntime({
          readTextFile: (path, maxBytes) => readWorkspaceTextFile(path, maxBytes),
          saveTextFile: (path, content) => saveWorkspaceTextFile(path, content),
          isBinaryPath: (path) => isBinaryFile(path),
          setFileContent: (path, content) => this._setCachedFileContent(path, content),
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
          createWorkspaceDocumentFile: (dirPath, options = {}) => createWorkspaceDocumentFile(dirPath, options),
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
          setFileContent: (path, value) => this._setCachedFileContent(path, value),
          deleteFileContent: (path) => this._deleteCachedFileContent(path),
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
      if (!workspacePath || useWorkspaceStore().path !== workspacePath) return
      const cachedRootExpandedDirs = Array.isArray(this.treeCacheByWorkspace[workspacePath]?.rootExpandedDirs)
        ? this.treeCacheByWorkspace[workspacePath].rootExpandedDirs
        : []
      if (cachedRootExpandedDirs.length === 0) {
        this._cacheWorkspaceSnapshot(workspacePath)
        return
      }

      const resolved = await restoreCachedExpandedTreeState(
        this.tree ?? [],
        cachedRootExpandedDirs,
        options.maxDirs ?? 6,
      )
      this._applyWorkspaceSnapshot(resolved, workspacePath, { preserveFlatFiles: true })
      for (const dirPath of resolved?.expandedDirs || []) {
        this.expandedDirs.add(dirPath)
      }
      this._cacheWorkspaceSnapshot(workspacePath)
    },

    async indexWorkspaceFiles(options = {}) {
      const workspacePath = useWorkspaceStore().path
      if (!workspacePath) return []

      const {
        delayMs = 0,
        force = false,
      } = options

      if (!force && this.flatFilesReady && this._flatFilesWorkspace === workspacePath) {
        return this.flatFilesCache
      }

      if (!force && this._flatFilesPromise && this._flatFilesWorkspace === workspacePath) {
        return this._flatFilesPromise
      }

      if (this._flatFilesTimer) {
        clearTimeout(this._flatFilesTimer)
        this._flatFilesTimer = null
      }

      const generation = (this._flatFilesGeneration || 0) + 1
      this._flatFilesGeneration = generation
      this._flatFilesWorkspace = workspacePath

      this._flatFilesPromise = new Promise((resolve, reject) => {
        this._flatFilesTimer = window.setTimeout(async () => {
          this._flatFilesTimer = null
          try {
            const snapshot = await readWorkspaceSnapshot(workspacePath, [])
            const flatFiles = snapshot?.flatFiles ?? []
            if (this._flatFilesGeneration !== generation || useWorkspaceStore().path !== workspacePath) {
              resolve([])
              return
            }
            this._applyWorkspaceSnapshot(snapshot, workspacePath)
            resolve(flatFiles)
          } catch (error) {
            if (this._flatFilesGeneration === generation) {
              this.flatFilesReady = false
            }
            reject(error)
          } finally {
            if (this._flatFilesGeneration === generation) {
              this._flatFilesPromise = null
            }
          }
        }, delayMs)
      })

      return this._flatFilesPromise
    },

    async ensureFlatFilesReady(options = {}) {
      return this.indexWorkspaceFiles({
        delayMs: 0,
        ...options,
      })
    },

    async loadFileTree(options = {}) {
      const workspacePath = useWorkspaceStore().path
      if (!workspacePath) return undefined

      const {
        suppressErrors = false,
        keepCurrentTreeOnError = false,
      } = options

      try {
        const snapshot = await loadWorkspaceTreeState(this.tree ?? [], [])
        this._applyWorkspaceSnapshot(snapshot, workspacePath)
        this.lastLoadError = null
        return snapshot?.tree || []
      } catch (error) {
        this.lastLoadError = error
        if (!suppressErrors) throw error
        return keepCurrentTreeOnError ? (this.tree ?? []) : []
      }
    },

    async ensureDirLoaded(path, options = {}) {
      const entry = findTreeEntry(this.tree ?? [], path)
      if (!entry?.is_dir) return []

      const { force = false } = options
      if (!force && Array.isArray(entry.children)) {
        return entry.children
      }

      this._dirLoadPromises ||= new Map()
      const existingPromise = this._dirLoadPromises.get(path)
      if (existingPromise && !force) {
        return existingPromise
      }

      const loadPromise = (async () => {
        const workspacePath = useWorkspaceStore().path
        if (workspacePath) {
          const snapshot = await loadWorkspaceTreeState(this.tree ?? [], [path])
          this._applyWorkspaceSnapshot(snapshot, workspacePath, { preserveFlatFiles: true })
          return findTreeEntry(snapshot?.tree || [], path)?.children || []
        }

        const children = await readDirShallow(path, {
          includeHidden: useWorkspaceStore().fileTreeShowHidden !== false,
        })
        const entry = findTreeEntry(this.tree ?? [], path)
        if (entry) {
          entry.children = children
        }
        this._setTree(this.tree ?? [], workspacePath, { preserveFlatFiles: true })
        return children
      })()

      this._dirLoadPromises.set(path, loadPromise)
      try {
        return await loadPromise
      } finally {
        this._dirLoadPromises.delete(path)
      }
    },

    async refreshVisibleTree(options = {}) {
      if (this._treeRefreshPromise) {
        this._treeRefreshQueued = true
        return this._treeRefreshPromise
      }

      const refreshVisibleTreeOnce = async () => {
        const workspacePath = useWorkspaceStore().path
        if (!workspacePath) return this.tree ?? []

        const runGeneration = this._treeRefreshGeneration || 0
        const {
          suppressErrors = false,
          reason = 'manual',
          announce = false,
        } = options

        this._beginReconcile(reason, { announce })

        try {
          const snapshot = await loadWorkspaceTreeState(this.tree ?? [], [])
          const nextTree = snapshot?.tree ?? []
          this._applyWorkspaceSnapshot(snapshot, workspacePath, { preserveFlatFiles: true })

          if (runGeneration !== (this._treeRefreshGeneration || 0)) {
            return this.tree ?? nextTree
          }

          this.lastLoadError = null
          this._finishReconcile(reason)
          return this.tree ?? nextTree
        } catch (error) {
          this.lastLoadError = error
          this._failReconcile(reason, error, { suppressErrors })
          if (!suppressErrors) throw error
          return this.tree ?? []
        }
      }

      const refreshLoop = async () => {
        let latestTree
        do {
          this._treeRefreshQueued = false
          latestTree = await refreshVisibleTreeOnce()
        } while (this._treeRefreshQueued)
        return latestTree ?? this.tree ?? []
      }

      this._treeRefreshPromise = refreshLoop()
      try {
        return await this._treeRefreshPromise
      } finally {
        this._treeRefreshPromise = null
      }
    },

    async revealPath(path) {
      const workspacePath = useWorkspaceStore().path
      if (!workspacePath || !path) return

      const resolved = await revealWorkspaceTreeState(path, this.tree ?? [])
      this._applyWorkspaceSnapshot(resolved, workspacePath, { preserveFlatFiles: true })
      for (const dirPath of resolved?.expandedDirs || []) {
        this.expandedDirs.add(dirPath)
      }
      this._cacheWorkspaceSnapshot()
    },

    async startWatching() {
      this._teardownNativeWatcher()
      this._teardownActivityHooks()
      this._setupActivityHooks()
      await this._setupNativeWatcher()
      this._notifyTreeVisibility(typeof document === 'undefined' || document.visibilityState === 'visible')
      this.noteTreeActivity()
    },

    async toggleDir(path) {
      if (this.expandedDirs.has(path)) {
        this.expandedDirs.delete(path)
        this._cacheWorkspaceSnapshot()
        return
      }

      await this.ensureDirLoaded(path)
      this.expandedDirs.add(path)
      this._cacheWorkspaceSnapshot()
    },

    isDirExpanded(path) {
      return this.expandedDirs.has(path)
    },

    async syncTreeAfterMutation(options = {}) {
      const { expandPath = null } = options
      const workspacePath = useWorkspaceStore().path
      if (!workspacePath) return

      const snapshot = await loadWorkspaceTreeState(
        this.tree ?? [],
        expandPath && expandPath !== workspacePath ? [expandPath] : [],
      )
      this._applyWorkspaceSnapshot(snapshot, workspacePath, { preserveFlatFiles: true })

      if (expandPath && expandPath !== workspacePath) {
        this.expandedDirs.add(expandPath)
      }

      this.flatFilesCache = []
      this.flatFilesReady = false
      this._cacheWorkspaceSnapshot()
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
      this._deleteCachedFileContent(path)
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
      this._setCachedFileContent(path, initialContent)
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

      let selectedPath
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

    async createDocumentFile(dirPath, options = {}) {
      return this._getFileCreationRuntime().createDocumentFile(dirPath, options)
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
      this._teardownNativeWatcher()
      this._teardownActivityHooks()
      this._treeRefreshGeneration = (this._treeRefreshGeneration || 0) + 1
      this._treeRefreshPromise = null
      this._treeRefreshQueued = false
      if (this._flatFilesTimer) {
        clearTimeout(this._flatFilesTimer)
      }
      this._flatFilesTimer = null
      this._flatFilesGeneration = (this._flatFilesGeneration || 0) + 1
      this._flatFilesPromise = null
      this._flatFilesWorkspace = null
      this._dirLoadPromises?.clear?.()
      this._dirLoadPromises = null
      this._fileContentRuntime?.reset?.()
      this._fileContentRuntime = null
      this._fileMutationRuntime = null
      this.tree = []
      this.flatFilesCache = []
      this.flatFilesReady = false
      this.lastWorkspaceSnapshot = null
      this.expandedDirs = new Set()
      this.fileContents = {}
      this.fileContentRevisions = {}
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
