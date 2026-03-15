import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useWorkspaceStore } from './workspace'
import { isBinaryFile } from '../utils/fileTypes'

function flattenFileTree(entries = []) {
  const files = []
  const walk = (items) => {
    for (const entry of items) {
      if (!entry.is_dir) {
        files.push(entry)
      }
      if (Array.isArray(entry.children)) {
        walk(entry.children)
      }
    }
  }
  walk(entries)
  return files
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

// Minimal valid DOCX — includes styles, numbering, settings, custom props
// (SuperDoc's export pipeline requires all of these or it silently fails)
const EMPTY_DOCX_BASE64 = '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'

export const useFilesStore = defineStore('files', {
  state: () => ({
    tree: [],
    flatFilesCache: [],
    flatFilesReady: false,
    treeCacheByWorkspace: {},
    expandedDirs: new Set(),
    activeFilePath: null,
    fileContents: {}, // cache: path → content
    deletingPaths: new Set(), // paths currently being deleted (prevents save-on-unmount race)
    unlisten: null,
    lastLoadError: null,
  }),

  getters: {
    // Flat list of all files for search
    flatFiles: (state) => state.flatFilesCache,
  },

  actions: {
    _cacheWorkspaceSnapshot(workspacePath = null) {
      const targetWorkspace = workspacePath || useWorkspaceStore().path
      if (!targetWorkspace) return
      this.treeCacheByWorkspace[targetWorkspace] = {
        tree: this.tree,
        flatFiles: this.flatFilesCache,
        flatFilesReady: this.flatFilesReady,
      }
    },

    _setTree(tree = [], workspacePath = null, options = {}) {
      const { preserveFlatFiles = false } = options
      this.tree = tree
      if (!preserveFlatFiles) {
        this.flatFilesCache = flattenFileTree(tree)
        this.flatFilesReady = false
      }
      this._cacheWorkspaceSnapshot(workspacePath)
    },

    _setFlatFiles(flatFiles = [], workspacePath = null) {
      this.flatFilesCache = flatFiles
      this.flatFilesReady = true
      this._cacheWorkspaceSnapshot(workspacePath)
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
      this.tree = cached.tree
      this.flatFilesCache = cached.flatFiles || flattenFileTree(cached.tree)
      this.flatFilesReady = !!cached.flatFilesReady
      this.lastLoadError = null
      return true
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
        if (!this.flatFilesCache.length) {
          this.flatFilesCache = flattenFileTree(nextTree)
          this.flatFilesReady = false
          this._cacheWorkspaceSnapshot(workspace.path)
        }
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
      const workspace = useWorkspaceStore()
      if (!workspace.path) return this.tree
      const { suppressErrors = false } = options

      try {
        let nextTree = await invoke('read_dir_shallow', { path: workspace.path })
        nextTree = mergePreservingLoadedChildren(nextTree, this.tree)

        const loadedDirectories = collectLoadedDirectoryPaths(this.tree)
          .filter(path => path !== workspace.path)
          .sort((a, b) => a.length - b.length)

        for (const dirPath of loadedDirectories) {
          try {
            const previousEntry = this._findEntry(dirPath)
            const children = await invoke('read_dir_shallow', { path: dirPath })
            nextTree = patchTreeEntry(nextTree, dirPath, (current) => ({
              ...current,
              children: mergePreservingLoadedChildren(children, previousEntry?.children || current.children || []),
            }))
          } catch (error) {
            // Directory may have been removed; keep refresh resilient.
          }
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
        clearInterval(this._pollTimer)
        this._pollTimer = null
      }

      let debounceTimer = null
      let accumulatedPaths = new Set()
      const workspace = useWorkspaceStore()
      this.unlisten = await listen('fs-change', async (event) => {
        // Only workspace-root changes should refresh the visible file tree.
        // Altals metadata now lives outside the workspace and has its own
        // listeners (reviews.js, references.js, comments.js).
        const paths = (event.payload?.paths || []).filter(p => {
          if (!workspace.path) return false
          if (!p.startsWith(workspace.path)) return false
          const rel = p.slice(workspace.path.length)
          return !rel.startsWith('/.git/')
        })
        if (paths.length === 0) return

        if (import.meta.env.DEV) {
          console.debug('[fs-watch]', event.payload?.kind, paths)
        }
        // Accumulate paths across debounced events so none are lost
        for (const p of paths) accumulatedPaths.add(p)

        // Debounce rapid fs events (e.g. auto-save triggering its own watch)
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(async () => {
          const changedPaths = [...accumulatedPaths]
          accumulatedPaths = new Set()

          await this.refreshVisibleTree({ suppressErrors: true })

          // Reload any open files that changed externally
          const { useEditorStore } = await import('./editor')
          const editorStore = useEditorStore()
          const openFiles = editorStore.allOpenFiles

          for (const changedPath of changedPaths) {
            if (openFiles.has(changedPath)) {
              await this.reloadFile(changedPath)
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

      // Periodic poll as fallback — catches events the notify watcher may miss
      // Only refreshes the visible tree and background index, not the entire workspace recursively.
      let lastTreeJson = JSON.stringify(normalizeTreeSnapshot(this.tree))
      this._pollTimer = setInterval(async () => {
        const workspace = useWorkspaceStore()
        if (!workspace.path) return
        try {
          await this.refreshVisibleTree({ suppressErrors: true })
          const newJson = JSON.stringify(normalizeTreeSnapshot(this.tree))
          if (newJson !== lastTreeJson) {
            lastTreeJson = newJson
          }
        } catch (e) { /* workspace may have closed */ }
      }, 5000)
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
      this._cacheWorkspaceSnapshot()
      this.flatFilesReady = false
      this._cacheWorkspaceSnapshot()
    },

    async readFile(path) {
      // PDF: extract text and cache it (for chat dedup and @file refs)
      if (path.toLowerCase().endsWith('.pdf')) {
        try {
          const { extractTextFromPdf } = await import('../utils/pdfMetadata')
          const text = await extractTextFromPdf(path)
          this.fileContents[path] = text
          return text
        } catch (e) {
          console.error('Failed to extract PDF text:', e)
          return null
        }
      }
      // Other binary files (DOCX, images) are handled by their own viewers
      if (isBinaryFile(path)) return null
      try {
        const content = await invoke('read_file', { path })
        this.fileContents[path] = content
        return content
      } catch (e) {
        console.error('Failed to read file:', e)
        return null
      }
    },

    async reloadFile(path) {
      const content = await this.readFile(path)
      // The editor will detect this change via the store
      return content
    },

    async saveFile(path, content) {
      try {
        await invoke('write_file', { path, content })
        this.fileContents[path] = content

        // Update wiki link index (markdown only)
        if (path.endsWith('.md')) {
          const { useLinksStore } = await import('./links')
          const linksStore = useLinksStore()
          linksStore.updateFile(path)
        }
      } catch (e) {
        console.error('Failed to save file:', e)
        const { useToastStore } = await import('./toast')
        const { formatFileError } = await import('../utils/errorMessages')
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
            const { useToastStore } = await import('./toast')
            useToastStore().showOnce(`create:${fullPath}`, `"${name}" already exists`, { type: 'error', duration: 4000 })
            return null
          }
          await invoke('write_file_base64', { path: fullPath, data: EMPTY_DOCX_BASE64 })
          await this.syncTreeAfterMutation({ expandPath: dirPath })
          return fullPath
        } catch (e) {
          console.error('Failed to create DOCX:', e)
          const { useToastStore } = await import('./toast')
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
        const { useToastStore } = await import('./toast')
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
          const { useToastStore } = await import('./toast')
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
        clearInterval(this._pollTimer)
        this._pollTimer = null
      }
      if (this._flatFilesTimer) {
        clearTimeout(this._flatFilesTimer)
        this._flatFilesTimer = null
      }
      this._flatFilesGeneration = (this._flatFilesGeneration || 0) + 1
      this._flatFilesPromise = null
      this._flatFilesWorkspace = null
      if (this._dirLoadPromises) {
        this._dirLoadPromises.clear()
      }
      this.tree = []
      this.flatFilesCache = []
      this.flatFilesReady = false
      this.expandedDirs = new Set()
      this.activeFilePath = null
      this.fileContents = {}
      this.lastLoadError = null
    },
  },
})
