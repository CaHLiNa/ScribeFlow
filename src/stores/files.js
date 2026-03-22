import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useWorkspaceStore } from './workspace'
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
  TEXT_FILE_READ_LIMIT_BYTES,
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
  mergePreservingLoadedChildren,
  patchTreeEntry,
} from '../domains/files/fileTreeRefreshRuntime'
import { createFileTreeWatchRuntime } from '../domains/files/fileTreeWatchRuntime'
import { formatFileError } from '../utils/errorMessages'
import { isBinaryFile } from '../utils/fileTypes'
import { extractTextFromPdf } from '../utils/pdfMetadata'
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

export const useFilesStore = defineStore('files', {
  state: () => ({
    tree: [],
    flatFilesCache: [],
    flatFilesReady: false,
    treeCacheByWorkspace: {},
    expandedDirs: new Set(),
    activeFilePath: null,
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
      if (!path) return
      const lowerPath = path.toLowerCase()
      if (lowerPath.endsWith('.pdf')) {
        delete this.pdfSourceKinds[path]
        return
      }
      if (lowerPath.endsWith('.tex') || lowerPath.endsWith('.typ')) {
        delete this.pdfSourceKinds[path.replace(/\.(tex|typ)$/i, '.pdf')]
      }
    },

    async _detectPdfSourceKind(pdfPath) {
      return detectPdfSourceKind({
        pdfPath,
        fileContents: this.fileContents,
        findEntry: (path) => this._findEntry(path),
      })
    },

    async ensurePdfSourceKind(pdfPath, options = {}) {
      if (!pdfPath?.toLowerCase().endsWith('.pdf')) return 'plain'
      const { force = false } = options
      const cached = this.pdfSourceKinds[pdfPath]
      if (!force && cached?.status === 'ready') {
        return cached.kind
      }

      if (!this._pdfSourcePromises) this._pdfSourcePromises = new Map()
      const existingPromise = this._pdfSourcePromises.get(pdfPath)
      if (existingPromise && !force) {
        return existingPromise
      }

      this._setPdfSourceState(pdfPath, {
        status: 'loading',
        kind: cached?.kind || 'plain',
      })

      const loadPromise = (async () => {
        const kind = await this._detectPdfSourceKind(pdfPath)
        this._setPdfSourceState(pdfPath, {
          status: 'ready',
          kind,
        })
        return kind
      })()

      this._pdfSourcePromises.set(pdfPath, loadPromise)
      try {
        return await loadPromise
      } catch (error) {
        this._setPdfSourceState(pdfPath, {
          status: 'ready',
          kind: 'plain',
        })
        throw error
      } finally {
        this._pdfSourcePromises.delete(pdfPath)
      }
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

    _findEntry(path) {
      const walk = (entries = []) => {
        for (const entry of entries) {
          if (entry.path === path) return entry
          if (Array.isArray(entry.children)) {
            const found = walk(entry.children)
            if (found) return found
          }
        }
        return null
      }
      return walk(this.tree)
    },

    restoreCachedTree(workspacePath) {
      if (!workspacePath) return false
      const patch = buildRestoredCachedTreeState(this.treeCacheByWorkspace[workspacePath])
      if (!patch) return false
      Object.assign(this, patch)
      return true
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
      const workspace = useWorkspaceStore()
      if (!workspace.path) return []

      const {
        delayMs = 0,
        force = false,
      } = options

      const workspacePath = workspace.path
      if (!force && this.flatFilesReady && this.treeCacheByWorkspace[workspacePath]?.flatFilesReady) {
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
            const flatFiles = await invoke('list_files_recursive', { path: workspacePath })
            if (this._flatFilesGeneration !== generation || useWorkspaceStore().path !== workspacePath) {
              resolve([])
              return
            }
            this._setFlatFiles(flatFiles, workspacePath)
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
      const workspace = useWorkspaceStore()
      if (!workspace.path) return
      const {
        suppressErrors = false,
        keepCurrentTreeOnError = false,
      } = options

      try {
        const tree = await invoke('read_dir_shallow', { path: workspace.path })
        const nextTree = mergePreservingLoadedChildren(tree, this.tree)
        this._setTree(nextTree, workspace.path, { preserveFlatFiles: true })
        this.flatFilesCache = []
        this.flatFilesReady = false
        this._cacheWorkspaceSnapshot(workspace.path)
        this.lastLoadError = null
        return nextTree
      } catch (e) {
        console.error('Failed to load file tree:', e)
        this.lastLoadError = e
        if (!suppressErrors) {
          throw e
        }
        return keepCurrentTreeOnError ? this.tree : []
      }
    },

    async ensureDirLoaded(path, options = {}) {
      const entry = this._findEntry(path)
      if (!entry?.is_dir) return []
      const { force = false } = options

      if (!force && Array.isArray(entry.children)) {
        return entry.children
      }

      if (!this._dirLoadPromises) this._dirLoadPromises = new Map()
      const existingPromise = this._dirLoadPromises.get(path)
      if (existingPromise && !force) {
        return existingPromise
      }

      const loadPromise = (async () => {
        const children = await invoke('read_dir_shallow', { path })
        this.tree = patchTreeEntry(this.tree, path, (current) => ({
          ...current,
          children: mergePreservingLoadedChildren(children, current.children || []),
        }))
        this._cacheWorkspaceSnapshot()
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
      return this._getVisibleTreeRefreshRuntime().refreshVisibleTree(options)
    },

    async revealPath(path) {
      const workspace = useWorkspaceStore()
      if (!workspace.path || !path.startsWith(workspace.path)) return

      const relativePath = path.slice(workspace.path.length).replace(/^\/+/, '')
      if (!relativePath) return

      const parts = relativePath.split('/').filter(Boolean)
      let currentPath = workspace.path
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = `${currentPath}/${parts[i]}`
        await this.ensureDirLoaded(currentPath)
        this.expandedDirs.add(currentPath)
      }
      this._cacheWorkspaceSnapshot()
    },

    async startWatching() {
      await this._getFileTreeWatchRuntime().startWatching()
    },

    async toggleDir(path) {
      if (this.expandedDirs.has(path)) {
        this.expandedDirs.delete(path)
        this._cacheWorkspaceSnapshot()
      } else {
        await this.ensureDirLoaded(path)
        this.expandedDirs.add(path)
        this._cacheWorkspaceSnapshot()
      }
    },

    isDirExpanded(path) {
      return this.expandedDirs.has(path)
    },

    async syncTreeAfterMutation(options = {}) {
      const { expandPath = null } = options
      await this.refreshVisibleTree({ suppressErrors: true, reason: 'mutation' })
      const workspacePath = useWorkspaceStore().path
      if (expandPath && expandPath !== workspacePath) {
        await this.ensureDirLoaded(expandPath, { force: true })
        this.expandedDirs.add(expandPath)
      }
      this.flatFilesCache = []
      this.flatFilesReady = false
      this._cacheWorkspaceSnapshot()
    },

    async readFile(path, options = {}) {
      const { maxBytes = TEXT_FILE_READ_LIMIT_BYTES } = options
      // PDF: extract text and cache it (for chat dedup and @file refs)
      if (path.toLowerCase().endsWith('.pdf')) {
        try {
          const text = await extractTextFromPdf(path)
          this.fileContents[path] = text
          this._clearFileLoadError(path)
          return text
        } catch (e) {
          console.error('Failed to extract PDF text:', e)
          return null
        }
      }
      // Other binary files are handled by dedicated viewers or fallbacks.
      if (isBinaryFile(path)) return null
      try {
        const content = await readWorkspaceTextFile(path, maxBytes)
        this.fileContents[path] = content
        this._clearFileLoadError(path)
        return content
      } catch (e) {
        console.error('Failed to read file:', e)
        this._setFileLoadError(path, e)
        return null
      }
    },

    async reloadFile(path) {
      if (path.toLowerCase().endsWith('.pdf')) {
        this.invalidatePdfSourceForPath(path)
        window.dispatchEvent(new CustomEvent('pdf-updated', {
          detail: { path },
        }))
        return null
      }
      const content = await this.readFile(path)
      // The editor will detect this change via the store
      return content
    },

    async saveFile(path, content) {
      try {
        await saveWorkspaceTextFile(path, content)
        this.fileContents[path] = content
        this._clearFileLoadError(path)

        // Update wiki link index (markdown only)
        syncSavedMarkdownLinks(path)
        return true
      } catch (e) {
        console.error('Failed to save file:', e)
        useToastStore().showOnce(`save:${path}`, formatFileError('save', path, e), { type: 'error', duration: 5000 })
        return false
      }
    },

    setInMemoryFileContent(path, content) {
      if (!path || typeof content !== 'string') return
      this.fileContents[path] = content
      this._clearFileLoadError(path)
    },

    async createFile(dirPath, name) {
      try {
        const result = await createWorkspaceFile(dirPath, name)
        if (!result.ok) {
          useToastStore().showOnce(`create:${result.path}`, `"${name}" already exists`, { type: 'error', duration: 4000 })
          return null
        }
        await this.syncTreeAfterMutation({ expandPath: dirPath })
        return result.path
      } catch (e) {
        console.error('Failed to create file:', e)
        useToastStore().showOnce(`create:${dirPath}/${name}`, `"${name}" already exists`, { type: 'error', duration: 4000 })
        return null
      }
    },

    async duplicatePath(path) {
      const dir = path.substring(0, path.lastIndexOf('/'))
      try {
        const newPath = await duplicateWorkspacePath(path)
        await this.syncTreeAfterMutation({ expandPath: dir })
        return newPath
      } catch (e) {
        console.error('Failed to duplicate:', e)
        return null
      }
    },

    async createFolder(dirPath, name) {
      try {
        const fullPath = await createWorkspaceFolder(dirPath, name)
        await this.syncTreeAfterMutation({ expandPath: dirPath })
        this.expandedDirs.add(fullPath)
        await this.ensureDirLoaded(fullPath, { force: true })
        this._cacheWorkspaceSnapshot()
        return fullPath
      } catch (e) {
        console.error('Failed to create folder:', e)
        return null
      }
    },

    async renamePath(oldPath, newPath) {
      try {
        const result = await renameWorkspaceEntry(oldPath, newPath)
        if (!result.ok) {
          const name = newPath.split('/').pop()
          useToastStore().showOnce(`rename:${newPath}`, `"${name}" already exists`, { type: 'error', duration: 4000 })
          return false
        }
        await this.syncTreeAfterMutation({ expandPath: newPath.substring(0, newPath.lastIndexOf('/')) })

        // Update active file if it was renamed
        if (this.activeFilePath === oldPath) {
          this.activeFilePath = newPath
        }

        // Migrate cached file content
        if (oldPath in this.fileContents) {
          this.fileContents[newPath] = this.fileContents[oldPath]
          delete this.fileContents[oldPath]
        }
        if (oldPath in this.fileLoadErrors) {
          this.fileLoadErrors[newPath] = this.fileLoadErrors[oldPath]
          delete this.fileLoadErrors[oldPath]
        }
        this.invalidatePdfSourceForPath(oldPath)
        this.invalidatePdfSourceForPath(newPath)

        // Update editor tabs so the open tab follows the rename
        await handleRenamedPathEffects(oldPath, newPath)

        // Update expanded dirs
        if (this.expandedDirs.has(oldPath)) {
          this.expandedDirs.delete(oldPath)
          this.expandedDirs.add(newPath)
        }

        return true
      } catch (e) {
        console.error('Failed to rename:', e)
        return false
      }
    },

    async movePath(srcPath, destDir) {
      const name = srcPath.split('/').pop()
      let destPath = `${destDir}/${name}`
      if (srcPath === destPath) return true

      try {
        const result = await relocateWorkspacePath(srcPath, destDir)
        destPath = result.destPath
        await this.syncTreeAfterMutation({ expandPath: destDir })

        this.invalidatePdfSourceForPath(srcPath)
        this.invalidatePdfSourceForPath(destPath)

        // Update editor tabs and wiki links
        await handleMovedPathEffects(srcPath, destPath)

        return true
      } catch (e) {
        console.error('Failed to move:', e)
        return false
      }
    },

    async copyExternalFile(srcPath, destDir) {
      try {
        const result = await copyExternalWorkspaceFile(srcPath, destDir)
        await this.syncTreeAfterMutation({ expandPath: destDir })
        return result
      } catch (e) {
        console.error('Failed to copy external file:', e)
        return null
      }
    },

    async deletePath(path) {
      try {
        this.deletingPaths.add(path)
        await removeWorkspacePath(path)
        await this.syncTreeAfterMutation()

        // Remove from file contents cache
        delete this.fileContents[path]
        delete this.fileLoadErrors[path]
        this.invalidatePdfSourceForPath(path)

        handleDeletedPathEffects(path)

        return true
      } catch (e) {
        console.error('Failed to delete:', e)
        return false
      } finally {
        this.deletingPaths.delete(path)
      }
    },

    cleanup() {
      this._fileTreeWatchRuntime?.stopWatching?.()
      this._fileTreeWatchRuntime = null
      if (this._flatFilesTimer) {
        clearTimeout(this._flatFilesTimer)
        this._flatFilesTimer = null
      }
      this._flatFilesGeneration = (this._flatFilesGeneration || 0) + 1
      this._flatFilesPromise = null
      this._flatFilesWorkspace = null
      this._visibleTreeRefreshRuntime?.reset?.()
      this._visibleTreeRefreshRuntime = null
      if (this._dirLoadPromises) {
        this._dirLoadPromises.clear()
      }
      if (this._pdfSourcePromises) {
        this._pdfSourcePromises.clear()
      }
      this.tree = []
      this.flatFilesCache = []
      this.flatFilesReady = false
      this.expandedDirs = new Set()
      this.activeFilePath = null
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
