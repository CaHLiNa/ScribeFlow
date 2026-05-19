import { defineStore } from 'pinia'
import { useWorkspaceStore } from './workspace'
import { useFilesStore } from './files'
import {
  extractMarkdownWikiLinks,
  resolveMarkdownLinkIndex,
} from '../services/markdown/runtimeBridge.ts'
import { filterWorkspaceFlatFilesByExtension } from '../domains/files/workspaceSnapshotFlatFilesRuntime.ts'
import { readWorkspaceTextFile } from '../services/fileStoreIO'
import { basenamePath } from '../utils/path'

// --- Pure helpers ---

function normalizeName(name) {
  return name.toLowerCase().replace(/[-_\s]+/g, ' ').trim()
}

async function fileNameFromPath(path) {
  const name = await basenamePath(path)
  return name.replace(/\.md$/, '')
}

export const useLinksStore = defineStore('links', {
  state: () => ({
    // filePath → [{target, display, heading, from, to, resolvedPath}]
    forwardLinks: {},
    // filePath → [{sourcePath, sourceName, linkText, lineNumber, context}]
    backlinks: {},
    // normalizedName → [filePath, ...]
    nameMap: {},
    // filePath → [heading1, heading2, ...]
    headings: {},
    initialized: false,
    _scanGeneration: 0,
  }),

  getters: {
    backlinksForFile: (state) => (filePath) => {
      return state.backlinks[filePath] || []
    },

    headingsForFile: (state) => (filePath) => {
      const h = state.headings[filePath] || []
      return h.map(item => typeof item === 'string' ? item : item.text)
    },

    structuredHeadingsForFile: (state) => (filePath) => {
      return state.headings[filePath] || []
    },

    allFileNames: (state) => {
      const names = []
      for (const [name, paths] of Object.entries(state.nameMap)) {
        for (const p of paths) {
          names.push({ name: p.replace(/^.*\//, '').replace(/\.md$/, ''), path: p, normalized: name })
        }
      }
      return names
    },

  },

  actions: {
    _getWorkspaceMarkdownFiles(filesStore) {
      const snapshot = filesStore?.lastWorkspaceSnapshot || { flatFiles: filesStore?.flatFiles || [] }
      return filterWorkspaceFlatFilesByExtension(snapshot, ['.md'])
    },

    async fullScan() {
      const workspace = useWorkspaceStore()
      const filesStore = useFilesStore()
      if (!workspace.path) return
      await filesStore.readWorkspaceSnapshot().catch(() => filesStore.ensureFlatFilesReady())
      const scanGeneration = ++this._scanGeneration
      const workspacePath = workspace.path

      await this._refreshIndexFromWorkspace({
        filesStore,
        workspace,
        workspacePath,
        scanGeneration,
      })

      this.initialized = true
    },

    async _refreshIndexFromWorkspace({
      filesStore = useFilesStore(),
      workspace = useWorkspaceStore(),
      workspacePath = workspace.path,
      scanGeneration = this._scanGeneration,
    } = {}) {
      const mdFiles = this._getWorkspaceMarkdownFiles(filesStore)

      const indexFiles = []
      for (const file of mdFiles) {
        if (scanGeneration !== this._scanGeneration || workspace.path !== workspacePath) {
          return
        }
        try {
          let content = filesStore.fileContents[file.path]
          if (content == null) {
            content = await readWorkspaceTextFile(file.path)
            filesStore.fileContents[file.path] = content
          }
          indexFiles.push({ path: file.path, content })
        } catch (e) {
          console.warn('Failed to index file:', file.path, e)
        }
      }

      if (scanGeneration !== this._scanGeneration || workspace.path !== workspacePath) {
        return
      }

      const index = await resolveMarkdownLinkIndex(workspacePath, indexFiles)
      if (scanGeneration !== this._scanGeneration || workspace.path !== workspacePath) {
        return
      }

      this.forwardLinks = index.forwardLinks || {}
      this.backlinks = index.backlinks || {}
      this.nameMap = index.nameMap || {}
      this.headings = index.headings || {}
    },

    async updateFile(path) {
      if (!path.endsWith('.md')) return
      if (!this.initialized) return

      try {
        const workspace = useWorkspaceStore()
        const filesStore = useFilesStore()
        if (!workspace.path) return
        await filesStore.readWorkspaceSnapshot().catch(() => filesStore.ensureFlatFilesReady())
        const content = await readWorkspaceTextFile(path)
        filesStore.fileContents[path] = content
        await this._refreshIndexFromWorkspace({
          filesStore,
          workspace,
          workspacePath: workspace.path,
        })
      } catch (e) {
        await this.fullScan()
      }
    },

    async handleRename(oldPath, newPath) {
      const workspace = useWorkspaceStore()
      const filesStore = useFilesStore()
      if (!workspace.path) return
      await filesStore.readWorkspaceSnapshot().catch(() => filesStore.ensureFlatFilesReady())

      const oldName = await fileNameFromPath(oldPath)
      const newName = await fileNameFromPath(newPath)

      if (oldName === newName) {
        await this.fullScan()
        return
      }

      // Name changed: update all [[oldName]] → [[newName]] across workspace
      const mdFiles = this._getWorkspaceMarkdownFiles(filesStore)
      for (const file of mdFiles) {
        try {
          let content = filesStore.fileContents[file.path]
          if (content == null) {
            content = await readWorkspaceTextFile(file.path)
          }

          const links = await extractMarkdownWikiLinks(content)
          const linksToUpdate = links.filter(l => {
            const normTarget = normalizeName(l.target)
            const normOld = normalizeName(oldName)
            return normTarget === normOld
          })

          if (linksToUpdate.length === 0) continue

          // Replace from end to start to preserve offsets
          let updated = content
          for (let i = linksToUpdate.length - 1; i >= 0; i--) {
            const link = linksToUpdate[i]
            let replacement = newName
            if (link.heading) replacement += '#' + link.heading
            if (link.display) replacement += '|' + link.display
            updated = updated.substring(0, link.from) + '[[' + replacement + ']]' + updated.substring(link.to)
          }

          if (updated !== content) {
            await filesStore.saveFile(file.path, updated)
          }
        } catch (e) {
          console.warn('Failed to update links in:', file.path, e)
        }
      }

      await this.fullScan()
    },

    handleDelete(path) {
      if (!path.endsWith('.md')) return
      void this.fullScan()
    },

    cleanup() {
      this._scanGeneration += 1
      this.forwardLinks = {}
      this.backlinks = {}
      this.nameMap = {}
      this.headings = {}
      this.initialized = false
    },
  },
})
