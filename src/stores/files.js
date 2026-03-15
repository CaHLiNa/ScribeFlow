import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useWorkspaceStore } from './workspace'
import { formatFileError } from '../utils/errorMessages'
import { isBinaryFile } from '../utils/fileTypes'
import { extractTextFromPdf } from '../utils/pdfMetadata'
import { useToastStore } from './toast'

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

const TEXT_FILE_READ_LIMIT_BYTES = 10 * 1024 * 1024
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

// Minimal valid DOCX — includes styles, numbering, settings, custom props
// (SuperDoc's export pipeline requires all of these or it silently fails)
const EMPTY_DOCX_BASE64 = 'UEsDBAoAAAAIAM9mUFze+2IhKAEAALIDAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbLWTyU7DMBCG7zyF5WuVuHBACDXtgeUIPZQHMM6ktfAmz6Q0b8+kiYqESnugHO35l09jebbYeSe2kNHGUMnrcioFBBNrG9aVfFs9F3dSIOlQaxcDVLIDlIv51WzVJUDB5oCV3BCle6XQbMBrLGOCwJMmZq+Jj3mtkjYfeg3qZjq9VSYGgkAF9RlyPnuERreOxNOOrweQDA6leBiEfVcldUrOGk08V9tQ/2gpxoaSnXsNbmzCCQukOtrQT34vGH2vvJlsaxBLnelFe1apz5hrVUfTenaWp2OOcMamsQYO/j4t5WgAkVfuXXmYeG3D5BwHUucAL08x5J6vByI2/AfAmHwWIbT+HTJLL89wiD4FwfZljgmVaZGi/zPFEFMwSIJM9vsR1P7Lzb8AUEsDBAoAAAAAAM9mUFwAAAAAAAAAAAAAAAAGAAAAX3JlbHMvUEsDBAoAAAAIAM9mUFxt9HMEzgAAAL0BAAALAAAAX3JlbHMvLnJlbHOtkLFOAzEMhneeIvLey7UDQqi5LgipG0LlAaLEdxdxiaPYBfr2eKCIog4MjLZ/f/7k7e4jL+YNGycqDtZdDwZLoJjK5ODl8Li6A8PiS/QLFXRwQobdcLN9xsWL7vCcKhuFFHYwi9R7aznMmD13VLHoZKSWvWjZJlt9ePUT2k3f39r2kwHDBdPso4O2j2swh1PFv7BpHFPABwrHjEWunPiVULJvE4qDd2rRxq92p1iw1202/2kTjiyUV7XpdpOkj/0WUpcnbZ8zZyV78fXhE1BLAwQKAAAAAADPZlBcAAAAAAAAAAAAAAAABQAAAHdvcmQvUEsDBAoAAAAIAM9mUFyv0oiIuAEAAAsFAAARAAAAd29yZC9kb2N1bWVudC54bWylVM2OmzAQvvcpkO+JIUrbFQrZQ1et9tCqUtoHcIwBa22PZRto+vQdwEBWlap0c8EeZuabb/58ePylVdIJ5yWYgmTblCTCcCilqQvy88fnzQNJfGCmZAqMKMhFePJ4fHfo8xJ4q4UJCSIYn/eWF6QJweaUet4IzfxWS+7AQxW2HDSFqpJc0B5cSXdplo4364AL7zHcJ2Y65kmE03+jgRUGlRU4zQKKrqaauZfWbhDdsiDPUslwQez0wwwDBWmdySPEZiE0uOQToXjMHu6WuJPLU6zAGJE6oZADGN9Iu6bxVjRUNjNI968kOq3I0oJbopWO9VhuraZAr5vwNCkXxCy9oYADxOJxC4XXMWcmmkmzBt6/ZZqua1HfN45fHLR2RZP3oT2blwVrWKP/wIo9uk7N30fm1DCL8655/lwbcOyskBFWPOlttidH3O0zlJfhtOPnuxuPU7gokfR5x1RBvg3tVIQeDzRa0GjuBQ/Roz79RnsciWy32+PL0ucN3t8/4J1OBl+Zw78BcHKz/WTiZN2EVTxDCKBXWYnqStsIVgpc2Y+7UawAwpVYt2EU08hzpkbnDOn6jB3/AFBLAwQKAAAAAADPZlBcAAAAAAAAAAAAAAAACwAAAHdvcmQvX3JlbHMvUEsDBAoAAAAIAM9mUFy2j+SG0QAAACMCAAAcAAAAd29yZC9fcmVscy9kb2N1bWVudC54bWwucmVsc62Rz2oCQQyH732KIXd3VoVSirNeRPAq2weYzmb/4E5mmERx374D1VZBSg8ek5Dv95Gs1mc/qhMmHgIZmBclKCQXmoE6Ax/1dvYGisVSY8dAaGBChnX1strjaCXvcD9EVhlCbKAXie9as+vRWy5CRMqTNiRvJZep09G6g+1QL8ryVadbBlR3TLVrDKRdMwdVTxH/ww5tOzjcBHf0SPIgQrNMY/ZXtU0dioHvusgc0I/jF0+NR5F811uBS+cvheUzFejoPzHlyF+Hn9ZVQt/9tvoCUEsDBAoAAAAIAM9mUFzXmM8I1wEAACgFAAAPAAAAd29yZC9zdHlsZXMueG1stVPbbtswDH3fVxh6Tx17XZEZdYqgQ7ACw1as6wfQsmILkyVNlONmXz9JviyXrgsK9MnmMXkOeUhf3zw1Itoyg1zJnCQXcxIxSVXJZZWTxx/r2YJEaEGWIJRkOdkxJDfLd9ddhnYnGEauXmLW5aS2VmdxjLRmDeCF0ky6bxtlGrAuNFXcKVNqoyhDdPSNiNP5/CpugEsy0DT0HJ4GzM9Wz6hqNFhecMHtLnCRqKHZXSWVgUK4Zrvkkixdq6Win9gGWmHRh+beDOEQhcdaSYtRlwFSznNyC4IXhhOHMEC7Qg4HYL2SeJhG8W8Ye0r87dAtiJyklyNyi8eYAFmNGJOzx4dDyQkqeOn0wMweVr4wHjqPj+fRx1EQ1kB50IGNZcZt+mruSQX3S00/fByD7603DlqrBhE9iOzTxieWhmNwFHanXbkGA5UBXXvWsk9zkj4KiXdlTr76hYqwHgkNGx0Y4ODMr3VYet9HKPyP1ET+mYG/4OSEvu4/REmvUACy8pt8TlyyJ/tyU5O5qrXeui9bMRbM982bTqw4uor36elV9Njecl8zd/rPudO3nTs5a+508czfsDhvblq7wak74RdOazjM+9Ei/2efODIkRVNWFNIOjm18w+UfUEsDBAoAAAAIAM9mUFwcoHSTDQEAAHYCAAASAAAAd29yZC9udW1iZXJpbmcueG1snZLBboMwDIbvewqUOwSmapoQ0MOmSbtvDxBCgGixHSUB1rdf2kK3adJU9ZREtr//t+Nq/wkmmZXzmrBmRZazRKGkTuNQs/e3l/SRJT4I7IQhVDU7KM/2zV21lDhBq1zMSyICfblYWbMxBFty7uWoQPgMtHTkqQ+ZJODU91oqvpDr+H1e5KebdSSV95HzJHAWnq04+EsjqzAGe3IgQny6gYNwH5NNI92KoFttdDhEdv6wYahmk8NyRaQXQ8eS8mxoPbYKd43uueSZ5AQKw0mRO2WiB0I/avvdxq20GBw3yPxfEzOYLW+5Ruz30MFschovmGJ3y08efYAsXwckJ1oTlyWCksUWO9ZU/MfCNF9QSwMECgAAAAgAz2ZQXMCCv4sOAQAAwQEAABEAAAB3b3JkL3NldHRpbmdzLnhtbI2QzW4CMQyE732Kle+QBfVPKxYOSJV6aC/QBzDZLERN4sgxbHn7GgpCVS+9JbJnvvHMFl8xVAfHxVNqYTKuoXLJUufTtoWP9ctoGaoimDoMlFwLR1dgMb+bDU1xIrpVKnVIpRla2Inkxphidy5iGVN2SWc9cUTRL2/NQNxlJutKUWkMZlrXjyaiT3CxifY/PhH5c59HlmJG8RsfvBzPXlBF27xuEzFugsYdJvcw17Cd63EfZI2blVCuhuaAoYWnaQ3mNLY7ZLTieJXRarIlJWEK172O3kmWCmMNflGc0bfX6qcNVSSMCv4V7Y06Bzras/9zXfSWqVAvY5UY6ntv3bknuNInDyekuTHNrfz5N1BLAwQKAAAAAADPZlBcAAAAAAAAAAAAAAAACQAAAGRvY1Byb3BzL1BLAwQKAAAACADPZlBc4dYAgJcAAADxAAAAEwAAAGRvY1Byb3BzL2N1c3RvbS54bWydzrEKwjAUheHdpwjZ21QHkdK0izg7VPeQ3rYBc2/ITYt9eyOC7o6HHz5O0z39Q6wQ2RFquS8rKQAtDQ4nLW/9pThJwcngYB6EoOUGLLt211wjBYjJAYssIGs5pxRqpdjO4A2XOWMuI0VvUp5xUjSOzsKZ7OIBkzpU1VHZhRP5Inw5+fHqNf1LDmTf7/jebyF7baN+Z9sXUEsBAhQACgAAAAgAz2ZQXN77YiEoAQAAsgMAABMAAAAAAAAAAAAAAAAAAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAAKAAAAAADPZlBcAAAAAAAAAAAAAAAABgAAAAAAAAAAABAAAABZAQAAX3JlbHMvUEsBAhQACgAAAAgAz2ZQXG30cwTOAAAAvQEAAAsAAAAAAAAAAAAAAAAAfQEAAF9yZWxzLy5yZWxzUEsBAhQACgAAAAAAz2ZQXAAAAAAAAAAAAAAAAAUAAAAAAAAAAAAQAAAAdAIAAHdvcmQvUEsBAhQACgAAAAgAz2ZQXK/SiIi4AQAACwUAABEAAAAAAAAAAAAAAAAAlwIAAHdvcmQvZG9jdW1lbnQueG1sUEsBAhQACgAAAAAAz2ZQXAAAAAAAAAAAAAAAAAsAAAAAAAAAAAAQAAAAfgQAAHdvcmQvX3JlbHMvUEsBAhQACgAAAAgAz2ZQXLaP5IbRAAAAIwIAABwAAAAAAAAAAAAAAAAApwQAAHdvcmQvX3JlbHMvZG9jdW1lbnQueG1sLnJlbHNQSwECFAAKAAAACADPZlBc15jPCNcBAAAoBQAADwAAAAAAAAAAAAAAAACyBQAAd29yZC9zdHlsZXMueG1sUEsBAhQACgAAAAgAz2ZQXBygdJMNAQAAdgIAABIAAAAAAAAAAAAAAAAAtgcAAHdvcmQvbnVtYmVyaW5nLnhtbFBLAQIUAAoAAAAIAM9mUFzAgr+LDgEAAMEBAAARAAAAAAAAAAAAAAAAAPMIAAB3b3JkL3NldHRpbmdzLnhtbFBLAQIUAAoAAAAAAM9mUFwAAAAAAAAAAAAAAAAJAAAAAAAAAAAAEAAAADAKAABkb2NQcm9wcy9QSwECFAAKAAAACADPZlBc4dYAgJcAAADxAAAAEwAAAAAAAAAAAAAAAABXCgAAZG9jUHJvcHMvY3VzdG9tLnhtbFBLBQYAAAAADAAMANcCAAAfCwAAAAA='

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
      const workflowStoreModule = await import('./documentWorkflow')
      const workflowStore = workflowStoreModule.useDocumentWorkflowStore()
      const texPath = pdfPath.replace(/\.pdf$/i, '.tex')
      const typPath = pdfPath.replace(/\.pdf$/i, '.typ')
      const workflowSourcePath = workflowStore.getSourcePathForPreview(pdfPath)

      if (workflowSourcePath === texPath) return 'latex'
      if (workflowSourcePath === typPath) return 'typst'

      if (this.fileContents[texPath] !== undefined) return 'latex'
      if (this.fileContents[typPath] !== undefined) return 'typst'

      if (this._findEntry(texPath)) return 'latex'
      if (this._findEntry(typPath)) return 'typst'

      try {
        const [hasTex, hasTyp] = await Promise.all([
          invoke('path_exists', { path: texPath }),
          invoke('path_exists', { path: typPath }),
        ])
        if (hasTex) return 'latex'
        if (hasTyp) return 'typst'
      } catch {
        // Fall back to the plain viewer if the filesystem probe fails.
      }

      return 'plain'
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
          await this.refreshVisibleTree({ suppressErrors: true })
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
      const { suppressErrors = false } = options

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
        return this.tree
      } catch (error) {
        console.error('Failed to refresh visible file tree:', error)
        this.lastLoadError = error
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
            await this.refreshVisibleTree({ suppressErrors: true })
          }

          // Reload any open files that changed externally
          const { useEditorStore } = await import('./editor')
          const editorStore = useEditorStore()
          const openFiles = editorStore.allOpenFiles

          for (const changedPath of changedPaths) {
            this.invalidatePdfSourceForPath(changedPath)
            if (openFiles.has(changedPath)) {
              if (changedPath.toLowerCase().endsWith('.pdf')) {
                window.dispatchEvent(new CustomEvent('pdf-updated', {
                  detail: { path: changedPath },
                }))
              } else {
                await this.reloadFile(changedPath)
              }
            }
            // Update wiki link index for changed .md files
            if (changedPath.endsWith('.md')) {
              const { useLinksStore } = await import('./links')
              const linksStore = useLinksStore()
              linksStore.updateFile(changedPath)
            }
          }
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
      await this.refreshVisibleTree({ suppressErrors: true })
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
        const content = await invoke('read_file', { path, maxBytes })
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
        await invoke('write_file', { path, content })
        this.fileContents[path] = content
        this._clearFileLoadError(path)

        // Update wiki link index (markdown only)
        if (path.endsWith('.md')) {
          const { useLinksStore } = await import('./links')
          const linksStore = useLinksStore()
          linksStore.updateFile(path)
        }
      } catch (e) {
        console.error('Failed to save file:', e)
        useToastStore().showOnce(`save:${path}`, formatFileError('save', path, e), { type: 'error', duration: 5000 })
      }
    },

    async createFile(dirPath, name) {
      const fullPath = `${dirPath}/${name}`

      // DOCX: binary template (SuperDoc needs a valid ZIP/OOXML structure)
      if (name.endsWith('.docx')) {
        try {
          // Check for collision (write_file_base64 would silently overwrite)
          const exists = await invoke('path_exists', { path: fullPath })
          if (exists) {
            useToastStore().showOnce(`create:${fullPath}`, `"${name}" already exists`, { type: 'error', duration: 4000 })
            return null
          }
          await invoke('write_file_base64', { path: fullPath, data: EMPTY_DOCX_BASE64 })
          await this.syncTreeAfterMutation({ expandPath: dirPath })
          return fullPath
        } catch (e) {
          console.error('Failed to create DOCX:', e)
          useToastStore().showOnce(`create:${fullPath}`, `Failed to create "${name}"`, { type: 'error', duration: 4000 })
          return null
        }
      }

      let content = ''
      if (name.endsWith('.ipynb')) {
        content = JSON.stringify({
          cells: [{ id: 'cell-1', cell_type: 'code', source: [], metadata: {}, outputs: [], execution_count: null }],
          metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' }, language_info: { name: 'python' } },
          nbformat: 4, nbformat_minor: 5,
        }, null, 1) + '\n'
      } else if (name.endsWith('.tex')) {
        const title = name.replace(/\.tex$/, '').replace(/-/g, ' ')
        content = `\\documentclass{article}\n\\title{${title}}\n\\author{}\n\\date{}\n\n\\begin{document}\n\\maketitle\n\n\n\n\\end{document}\n`
      } else if (name.endsWith('.typ')) {
        const title = name.replace(/\.typ$/, '').replace(/-/g, ' ')
        content = `= ${title}\n\nStart writing here.\n`
      }
      try {
        await invoke('create_file', { path: fullPath, content })
        await this.syncTreeAfterMutation({ expandPath: dirPath })
        return fullPath
      } catch (e) {
        console.error('Failed to create file:', e)
        useToastStore().showOnce(`create:${fullPath}`, `"${name}" already exists`, { type: 'error', duration: 4000 })
        return null
      }
    },

    async duplicatePath(path) {
      const name = path.split('/').pop()
      const dir = path.substring(0, path.lastIndexOf('/'))
      const isDir = await invoke('is_directory', { path })

      // Generate unique name: "name copy.ext", "name copy 2.ext", etc.
      let newName
      if (isDir) {
        newName = `${name} copy`
        let i = 2
        while (await invoke('path_exists', { path: `${dir}/${newName}` })) {
          newName = `${name} copy ${i}`
          i++
        }
      } else {
        const dotIdx = name.lastIndexOf('.')
        const base = dotIdx > 0 ? name.substring(0, dotIdx) : name
        const suffix = dotIdx > 0 ? name.substring(dotIdx) : ''
        newName = `${base} copy${suffix}`
        let i = 2
        while (await invoke('path_exists', { path: `${dir}/${newName}` })) {
          newName = `${base} copy ${i}${suffix}`
          i++
        }
      }

      const newPath = `${dir}/${newName}`
      try {
        if (isDir) {
          await invoke('copy_dir', { src: path, dest: newPath })
        } else {
          await invoke('copy_file', { src: path, dest: newPath })
        }
        await this.syncTreeAfterMutation({ expandPath: dir })
        return newPath
      } catch (e) {
        console.error('Failed to duplicate:', e)
        return null
      }
    },

    async createFolder(dirPath, name) {
      const fullPath = `${dirPath}/${name}`
      try {
        await invoke('create_dir', { path: fullPath })
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
      // Prevent overwriting an existing file
      if (oldPath !== newPath) {
        const exists = await invoke('path_exists', { path: newPath })
        if (exists) {
          const name = newPath.split('/').pop()
          useToastStore().showOnce(`rename:${newPath}`, `"${name}" already exists`, { type: 'error', duration: 4000 })
          return false
        }
      }
      try {
        await invoke('rename_path', { oldPath, newPath })
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
        const { useEditorStore } = await import('./editor')
        const editorStore = useEditorStore()
        editorStore.updateFilePath(oldPath, newPath)

        // Update expanded dirs
        if (this.expandedDirs.has(oldPath)) {
          this.expandedDirs.delete(oldPath)
          this.expandedDirs.add(newPath)
        }

        // Update wiki links across workspace
        const { useLinksStore } = await import('./links')
        const linksStore = useLinksStore()
        await linksStore.handleRename(oldPath, newPath)

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

      // Avoid overwriting: auto-rename if destination exists
      const exists = await invoke('path_exists', { path: destPath })
      if (exists) {
        const isDir = await invoke('is_directory', { path: srcPath })
        if (isDir) {
          let i = 2
          while (await invoke('path_exists', { path: `${destDir}/${name} ${i}` })) i++
          destPath = `${destDir}/${name} ${i}`
        } else {
          const dotIdx = name.lastIndexOf('.')
          const base = dotIdx > 0 ? name.substring(0, dotIdx) : name
          const suffix = dotIdx > 0 ? name.substring(dotIdx) : ''
          let i = 2
          while (await invoke('path_exists', { path: `${destDir}/${base} ${i}${suffix}` })) i++
          destPath = `${destDir}/${base} ${i}${suffix}`
        }
      }

      try {
        await invoke('rename_path', { oldPath: srcPath, newPath: destPath })
        await this.syncTreeAfterMutation({ expandPath: destDir })

        // Update wiki links
        const { useLinksStore } = await import('./links')
        const linksStore = useLinksStore()
        await linksStore.handleRename(srcPath, destPath)
        this.invalidatePdfSourceForPath(srcPath)
        this.invalidatePdfSourceForPath(destPath)

        // Update editor tabs
        const { useEditorStore } = await import('./editor')
        const editorStore = useEditorStore()
        editorStore.updateFilePath(srcPath, destPath)

        return true
      } catch (e) {
        console.error('Failed to move:', e)
        return false
      }
    },

    async copyExternalFile(srcPath, destDir) {
      const isDir = await invoke('is_directory', { path: srcPath })
      const name = srcPath.split('/').pop()
      let destPath = `${destDir}/${name}`
      // Avoid overwriting
      const exists = await invoke('path_exists', { path: destPath })
      if (exists) {
        if (isDir) {
          let i = 2
          while (await invoke('path_exists', { path: `${destDir}/${name} ${i}` })) i++
          destPath = `${destDir}/${name} ${i}`
        } else {
          const ext = name.lastIndexOf('.')
          const base = ext > 0 ? name.substring(0, ext) : name
          const suffix = ext > 0 ? name.substring(ext) : ''
          let i = 2
          while (await invoke('path_exists', { path: `${destDir}/${base} ${i}${suffix}` })) i++
          destPath = `${destDir}/${base} ${i}${suffix}`
        }
      }
      try {
        if (isDir) {
          await invoke('copy_dir', { src: srcPath, dest: destPath })
        } else {
          await invoke('copy_file', { src: srcPath, dest: destPath })
        }
        await this.syncTreeAfterMutation({ expandPath: destDir })
        return { path: destPath, isDir }
      } catch (e) {
        console.error('Failed to copy external file:', e)
        return null
      }
    },

    async deletePath(path) {
      try {
        this.deletingPaths.add(path)
        await invoke('delete_path', { path })
        await this.syncTreeAfterMutation()

        // Close all tabs for the deleted file
        const { useEditorStore } = await import('./editor')
        const editorStore = useEditorStore()
        editorStore.closeFileFromAllPanes(path)

        // Remove from file contents cache
        delete this.fileContents[path]
        delete this.fileLoadErrors[path]
        this.invalidatePdfSourceForPath(path)

        // Update wiki link index
        const { useLinksStore } = await import('./links')
        const linksStore = useLinksStore()
        linksStore.handleDelete(path)

        // Discard any pending AI edits for the deleted file
        const { useReviewsStore } = await import('./reviews')
        useReviewsStore().discardAllForFile(path)

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
    },
  },
})
