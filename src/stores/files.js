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
import { formatFileError } from '../utils/errorMessages'
import { isBinaryFile } from '../utils/fileTypes'
import { extractTextFromPdf } from '../utils/pdfMetadata'
import { t } from '../i18n'
import { useToastStore } from './toast'
import { useUxStatusStore } from './uxStatus'

function cloneRootEntries(entries = []) {
  return entries.map((entry) => {
    const { children, ...rest } = entry
    return { ...rest }
  })
}

function collectRootExpandedDirs(entries = [], expandedDirs = new Set()) {
  const rootDirPaths = new Set(entries.filter(entry => entry?.is_dir).map(entry => entry.path))
  return [...expandedDirs].filter(path => rootDirPaths.has(path))
}

function patchTreeEntry(entries = [], targetPath, updater) {
  let changed = false
  const nextEntries = entries.map((entry) => {
    if (entry.path === targetPath) {
      changed = true
      return updater(entry)
    }

    if (Array.isArray(entry.children)) {
      const nextChildren = patchTreeEntry(entry.children, targetPath, updater)
      if (nextChildren !== entry.children) {
        changed = true
        return { ...entry, children: nextChildren }
      }
    }

    return entry
  })

  return changed ? nextEntries : entries
}

function mergePreservingLoadedChildren(nextEntries = [], previousEntries = []) {
  const previousByPath = new Map(previousEntries.map(entry => [entry.path, entry]))
  return nextEntries.map((entry) => {
    const previous = previousByPath.get(entry.path)
    if (!entry.is_dir || !previous?.is_dir) {
      return entry
    }

    if (Array.isArray(previous.children)) {
      if (!Array.isArray(entry.children)) {
        return {
          ...entry,
          children: previous.children,
        }
      }
      return {
        ...entry,
        children: mergePreservingLoadedChildren(entry.children, previous.children),
      }
    }

    return entry
  })
}

function collectLoadedDirectoryPaths(entries = [], paths = []) {
  for (const entry of entries) {
    if (!entry.is_dir || !Array.isArray(entry.children)) continue
    paths.push(entry.path)
    collectLoadedDirectoryPaths(entry.children, paths)
  }
  return paths
}

function normalizeTreeSnapshot(entries = []) {
  return entries.map((entry) => ({
    path: entry.path,
    is_dir: entry.is_dir,
    modified: entry.modified ?? null,
    children: Array.isArray(entry.children) ? normalizeTreeSnapshot(entry.children) : null,
  }))
}

const ACTIVE_TREE_POLL_INTERVAL_MS = 5000
const IDLE_TREE_POLL_INTERVAL_MS = 20000
const TREE_ACTIVITY_WINDOW_MS = 30000
const TREE_REFRESH_CONCURRENCY = 6

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

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
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
    unlisten: null,
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
      this.treeCacheByWorkspace[targetWorkspace] = {
        tree: cloneRootEntries(this.tree),
        rootExpandedDirs: collectRootExpandedDirs(this.tree, this.expandedDirs),
      }
    },

    _setTree(tree = [], workspacePath = null, options = {}) {
      const { preserveFlatFiles = false } = options
      this.tree = tree
      if (!preserveFlatFiles) {
        this.flatFilesCache = []
        this.flatFilesReady = false
      }
      this._cacheWorkspaceSnapshot(workspacePath)
    },

    _setFlatFiles(flatFiles = [], workspacePath = null) {
      this.flatFilesCache = flatFiles
      this.flatFilesReady = true
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
      this._lastTreeActivityAt = Date.now()
      if (useWorkspaceStore().path) {
        this._scheduleNextTreePoll()
      }
    },

    _setupTreePollingActivityHooks() {
      this._teardownTreePollingActivityHooks()
      const markActivity = () => this.noteTreeActivity()
      const visibilityHandler = () => this._scheduleNextTreePoll()
      this._treeActivityHandlers = { markActivity, visibilityHandler }
      window.addEventListener('focus', markActivity)
      window.addEventListener('mousedown', markActivity, true)
      window.addEventListener('keydown', markActivity, true)
      document.addEventListener('visibilitychange', visibilityHandler)
    },

    _teardownTreePollingActivityHooks() {
      if (!this._treeActivityHandlers) return
      const { markActivity, visibilityHandler } = this._treeActivityHandlers
      window.removeEventListener('focus', markActivity)
      window.removeEventListener('mousedown', markActivity, true)
      window.removeEventListener('keydown', markActivity, true)
      document.removeEventListener('visibilitychange', visibilityHandler)
      this._treeActivityHandlers = null
    },

    _scheduleNextTreePoll() {
      if (this._pollTimer) {
        clearTimeout(this._pollTimer)
        this._pollTimer = null
      }

      const workspace = useWorkspaceStore()
      if (!workspace.path) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return

      const lastActivityAt = this._lastTreeActivityAt || 0
      const isActive = Date.now() - lastActivityAt <= TREE_ACTIVITY_WINDOW_MS
      const delayMs = isActive ? ACTIVE_TREE_POLL_INTERVAL_MS : IDLE_TREE_POLL_INTERVAL_MS

      this._pollTimer = window.setTimeout(async () => {
        this._pollTimer = null
        const activeWorkspace = useWorkspaceStore()
        if (!activeWorkspace.path || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) {
          this._scheduleNextTreePoll()
          return
        }
        try {
          await this.refreshVisibleTree({ suppressErrors: true, reason: 'poll' })
        } catch {
          // Workspace may have closed between scheduling and execution.
        } finally {
          this._scheduleNextTreePoll()
        }
      }, delayMs)
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
      const cached = this.treeCacheByWorkspace[workspacePath]
      if (!cached?.tree) return false
      this.tree = cloneRootEntries(cached.tree)
      this.flatFilesCache = []
      this.flatFilesReady = false
      this.expandedDirs = new Set(cached.rootExpandedDirs || [])
      this.lastLoadError = null
      return true
    },

    async restoreCachedExpandedDirs(workspacePath, options = {}) {
      if (!workspacePath) return
      const cached = this.treeCacheByWorkspace[workspacePath]
      const rootExpandedDirs = Array.isArray(cached?.rootExpandedDirs) ? cached.rootExpandedDirs : []
      const { maxDirs = 6 } = options

      for (const dirPath of rootExpandedDirs.slice(0, maxDirs)) {
        if (useWorkspaceStore().path !== workspacePath) return
        try {
          await this.ensureDirLoaded(dirPath)
          this.expandedDirs.add(dirPath)
        } catch {
          // Directory may have disappeared or become inaccessible.
        }
      }

      this._cacheWorkspaceSnapshot(workspacePath)
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

    async _refreshVisibleTreeOnce(options = {}) {
      const workspace = useWorkspaceStore()
      if (!workspace.path) return this.tree
      const {
        suppressErrors = false,
        reason = 'manual',
        announce = false,
      } = options
      this._beginReconcile(reason, { announce })

      try {
        let nextTree = await invoke('read_dir_shallow', { path: workspace.path })
        nextTree = mergePreservingLoadedChildren(nextTree, this.tree)

        const loadedDirectories = collectLoadedDirectoryPaths(this.tree)
          .filter(path => path !== workspace.path)
          .sort((a, b) => a.length - b.length)

        const directoryResults = await mapWithConcurrency(
          loadedDirectories,
          TREE_REFRESH_CONCURRENCY,
          async (dirPath) => {
            try {
              const children = await invoke('read_dir_shallow', { path: dirPath })
              return { dirPath, children }
            } catch {
              return null
            }
          },
        )

        for (const result of directoryResults) {
          if (!result) continue
          const previousEntry = this._findEntry(result.dirPath)
          nextTree = patchTreeEntry(nextTree, result.dirPath, (current) => ({
            ...current,
            children: mergePreservingLoadedChildren(
              result.children,
              previousEntry?.children || current.children || [],
            ),
          }))
        }

        const previousSnapshot = JSON.stringify(normalizeTreeSnapshot(this.tree))
        const nextSnapshot = JSON.stringify(normalizeTreeSnapshot(nextTree))
        if (previousSnapshot !== nextSnapshot) {
          this._setTree(nextTree, workspace.path, { preserveFlatFiles: true })
        }
        this.lastLoadError = null
        this._finishReconcile(reason)
        return this.tree
      } catch (error) {
        console.error('Failed to refresh visible file tree:', error)
        this.lastLoadError = error
        this._failReconcile(reason, error, { suppressErrors })
        if (!suppressErrors) throw error
        return this.tree
      }
    },

    async refreshVisibleTree(options = {}) {
      if (this._refreshVisibleTreePromise) {
        this._refreshVisibleTreeQueued = true
        return this._refreshVisibleTreePromise
      }

      const refreshLoop = async () => {
        do {
          this._refreshVisibleTreeQueued = false
          await this._refreshVisibleTreeOnce(options)
        } while (this._refreshVisibleTreeQueued)
        return this.tree
      }

      this._refreshVisibleTreePromise = refreshLoop()
      try {
        return await this._refreshVisibleTreePromise
      } finally {
        this._refreshVisibleTreePromise = null
      }
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
      // Listen for filesystem changes
      if (this.unlisten) {
        this.unlisten()
      }
      if (this._pollTimer) {
        clearTimeout(this._pollTimer)
        this._pollTimer = null
      }
      this._setupTreePollingActivityHooks()
      this.noteTreeActivity()

      let debounceTimer = null
      let accumulatedPaths = new Set()
      const workspace = useWorkspaceStore()
      this.unlisten = await listen('fs-change', async (event) => {
        const paths = (event.payload?.paths || []).filter((path) => {
          if (workspace.path && path.startsWith(workspace.path)) {
            const rel = path.slice(workspace.path.length)
            return !rel.startsWith('/.git/')
          }
          return !!(workspace.workspaceDataDir && path.startsWith(workspace.workspaceDataDir))
        })
        if (paths.length === 0) return

        if (import.meta.env.DEV) {
          console.debug('[fs-watch]', event.payload?.kind, paths)
        }
        this.noteTreeActivity()
        // Accumulate paths across debounced events so none are lost
        for (const p of paths) accumulatedPaths.add(p)

        // Debounce rapid fs events (e.g. auto-save triggering its own watch)
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(async () => {
          const changedPaths = [...accumulatedPaths]
          accumulatedPaths = new Set()

          if (workspace.path && changedPaths.some(path => path.startsWith(workspace.path))) {
            await this.refreshVisibleTree({ suppressErrors: true, reason: 'watch' })
          }

          await handleExternalFileChanges(this, changedPaths)
        }, 300)
      })

      // Fallback poll stays low-frequency and only runs while the app is visible.
      this._scheduleNextTreePoll()
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
      // Other binary files (DOCX, images) are handled by their own viewers
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
      } catch (e) {
        console.error('Failed to save file:', e)
        useToastStore().showOnce(`save:${path}`, formatFileError('save', path, e), { type: 'error', duration: 5000 })
      }
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
      if (this.unlisten) {
        this.unlisten()
        this.unlisten = null
      }
      if (this._pollTimer) {
        clearTimeout(this._pollTimer)
        this._pollTimer = null
      }
      this._teardownTreePollingActivityHooks()
      if (this._flatFilesTimer) {
        clearTimeout(this._flatFilesTimer)
        this._flatFilesTimer = null
      }
      this._flatFilesGeneration = (this._flatFilesGeneration || 0) + 1
      this._flatFilesPromise = null
      this._flatFilesWorkspace = null
      this._refreshVisibleTreePromise = null
      this._refreshVisibleTreeQueued = false
      this._lastTreeActivityAt = 0
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
      if (reason === 'visibility') {
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
