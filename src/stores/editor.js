import { defineStore } from 'pinia'
import { nanoid } from './utils'
import { useFilesStore } from './files'
import { useWorkspaceStore } from './workspace'
import {
  isNewTab,
  isPreviewPath,
} from '../utils/fileTypes'
import {
  collapsePaneNode,
  findFirstLeaf,
  findLeaf,
  findPane,
  findPaneWithTab,
  findParent,
  ROOT_PANE_ID,
} from '../domains/editor/paneTreeLayout'
import {
  closePaneTab,
  movePaneTab,
  reorderPaneTabs,
} from '../domains/editor/paneTabs'
import {
  buildRecentFilesAfterOpen,
  cancelEditorStateSave,
  flushEditorStateSave,
  loadEditorStateSnapshot,
  loadRecentFilesForWorkspace,
  persistRecentFilesForWorkspace,
  scheduleEditorStateSave,
} from '../domains/editor/editorPersistenceRuntime'
import {
  getAnyRegisteredEditorView,
  getRegisteredEditorView,
  getRegisteredEditorViewsForPath,
  registerEditorView as registerEditorRuntimeView,
  unregisterEditorView as unregisterEditorRuntimeView,
} from '../domains/editor/editorViewRegistry'
import {
  clearDirtyPath,
  collectDirtyPaths,
  hasDirtyPath,
  markDirtyPath,
  persistEditorPath,
  persistEditorPaths,
} from '../domains/editor/editorDirtyPersistence'
import {
  createEmptyEditorRuntimeState,
  destroyEditorRuntimeViews,
} from '../domains/editor/editorCleanupRuntime'
import { createEditorOpenRoutingRuntime } from '../domains/editor/editorOpenRoutingRuntime'
import { filterExistingRecentFiles } from '../domains/files/workspaceSnapshotFlatFilesRuntime'

function isLauncherTab(path) {
  return isNewTab(path)
}

function isContextCandidatePath(path) {
  return !!path
    && !isLauncherTab(path)
    && !isPreviewPath(path)
}

function createNewTabPath() {
  return `newtab:${nanoid()}`
}

export const useEditorStore = defineStore('editor', {
  state: () => ({
    ...createEmptyEditorRuntimeState(),
    _editorOpenRoutingRuntime: null,
  }),

  getters: {
    activePane(state) {
      return this.findPane(state.paneTree, state.activePaneId)
    },

    activeTab() {
      return this.activePane?.activeTab || null
    },

    allOpenFiles(state) {
      const files = new Set()

      const walk = (node) => {
        if (!node) return
        if (node.type === 'leaf') {
          for (const tab of node.tabs || []) {
            files.add(tab)
          }
          return
        }

        for (const child of node.children || []) {
          walk(child)
        }
      }

      walk(state.paneTree)
      for (const tab of state.documentDockTabs || []) {
        files.add(tab)
      }
      return files
    },

    recentFilesForEmptyState(state) {
      const filesStore = useFilesStore()
      return filterExistingRecentFiles(state.recentFiles, filesStore.lastWorkspaceSnapshot).slice(0, 5)
    },

    preferredContextPath(state) {
      const activePane = this.findPane(state.paneTree, state.activePaneId)
      if (isContextCandidatePath(activePane?.activeTab)) {
        return activePane.activeTab
      }

      if (isContextCandidatePath(state.lastContextPath) && this.findPaneWithTab(state.lastContextPath)) {
        return state.lastContextPath
      }

      const openLeaf = this._findLeaf((node) => isContextCandidatePath(node.activeTab))
      if (isContextCandidatePath(openLeaf?.activeTab)) {
        return openLeaf.activeTab
      }

      return state.recentFiles.find((entry) => isContextCandidatePath(entry.path))?.path || null
    },
  },

  actions: {
    findPane(node, id) {
      return findPane(node, id)
    },

    findParent(node, id, parent = null) {
      return findParent(node, id, parent)
    },

    findPaneWithTab(tabPath) {
      return findPaneWithTab(this.paneTree, tabPath)
    },

    findFirstLeaf(node) {
      return findFirstLeaf(node)
    },

    getCompanionPaneId(paneId) {
      void paneId
      return null
    },

    _findLeaf(predicate) {
      return findLeaf(this.paneTree, predicate)
    },

    _rememberContextPath(path) {
      if (!isContextCandidatePath(path)) return
      this.lastContextPath = path
    },

    _getEditorOpenRoutingRuntime() {
      if (!this._editorOpenRoutingRuntime) {
        this._editorOpenRoutingRuntime = createEditorOpenRoutingRuntime({
          getActivePaneId: () => this.activePaneId,
          setActivePaneId: (paneId) => {
            this.activePaneId = paneId
          },
          findPane: (paneId) => this.findPane(this.paneTree, paneId),
          findPaneWithTab: (tabPath) => this.findPaneWithTab(tabPath),
          rememberContextPath: (path) => this._rememberContextPath(path),
          recordFileOpen: (path) => this.recordFileOpen(path),
          revealInTree: (path) => this._revealInTree(path),
          saveEditorState: () => this.saveEditorState(),
          createNewTabPath,
        })
      }

      return this._editorOpenRoutingRuntime
    },

    openFile(path) {
      if (!path) return
      return this._getEditorOpenRoutingRuntime().openFile(path)
    },

    openNewTab(paneId = null) {
      return this._getEditorOpenRoutingRuntime().openNewTab(paneId)
    },

    openNewTabBeside() {
      this.openNewTab(this.activePaneId)
      return this.activePaneId
    },

    openFileInPane(path, paneId, options = {}) {
      if (!path || !paneId) return null
      return this._getEditorOpenRoutingRuntime().openFileInPane(path, paneId, options)
    },

    openDocumentDockFile(path) {
      if (!path || isLauncherTab(path) || isPreviewPath(path)) return false
      if (!this.documentDockTabs.includes(path)) {
        this.documentDockTabs.push(path)
      }
      this.activeDocumentDockTab = path
      this.recordFileOpen(path)
      this._rememberContextPath(path)
      this.saveEditorState()
      return true
    },

    setActiveDocumentDockFile(path) {
      if (!path || !this.documentDockTabs.includes(path)) return false
      this.activeDocumentDockTab = path
      this._rememberContextPath(path)
      this.saveEditorState()
      return true
    },

    closeDocumentDockFile(path) {
      if (!path) return false
      const index = this.documentDockTabs.indexOf(path)
      if (index === -1) return false

      this.documentDockTabs.splice(index, 1)
      if (this.activeDocumentDockTab === path) {
        this.activeDocumentDockTab =
          this.documentDockTabs[Math.min(index, this.documentDockTabs.length - 1)] || null
      }
      this.saveEditorState()
      return true
    },

    _revealInTree(path) {
      if (!path || isLauncherTab(path) || isPreviewPath(path)) return
      const workspace = useWorkspaceStore()
      const filesStore = useFilesStore()
      if (!workspace.path || !String(path).startsWith(workspace.path)) return
      void filesStore.revealPath(path)
    },

    moveTabToPane(fromPaneId, tabPath, toPaneId, insertIdx = 0) {
      if (!fromPaneId || !toPaneId || !tabPath) return

      if (fromPaneId === toPaneId) {
        const pane = this.findPane(this.paneTree, fromPaneId)
        if (!pane) return
        const fromIdx = pane.tabs.indexOf(tabPath)
        if (fromIdx === -1) return
        this.reorderTabs(fromPaneId, fromIdx, insertIdx)
        return
      }

      const fromPane = this.findPane(this.paneTree, fromPaneId)
      const toPane = this.findPane(this.paneTree, toPaneId)
      if (!fromPane || !toPane) return

      const result = movePaneTab(fromPane, toPane, tabPath, insertIdx)
      if (!result.moved) return

      this.activePaneId = toPaneId
      this._rememberContextPath(tabPath)

      if (result.sourceEmpty) {
        const parent = this.findParent(this.paneTree, fromPane.id)
        if (parent) this.collapsePane(fromPane.id)
      }

      this.saveEditorState()
    },

    closeTab(paneId, path) {
      const pane = this.findPane(this.paneTree, paneId)
      if (!pane || !path) return

      const result = closePaneTab(pane, path)
      if (!result.closed) return

      unregisterEditorRuntimeView(this.editorViews, paneId, path)
      this.clearFileDirty(path)

      if (paneId === this.activePaneId && result.activeTab) {
        this._rememberContextPath(result.activeTab)
      }

      if (result.isEmpty) {
        const parent = this.findParent(this.paneTree, pane.id)
        if (parent) {
          this.collapsePane(pane.id)
          return
        }
      }

      this.saveEditorState()
    },

    collapsePane(paneId) {
      const result = collapsePaneNode(this.paneTree, paneId, this.activePaneId)
      if (!result.collapsed) return
      this.activePaneId = result.activePaneId
      this.saveEditorState()
    },

    setActivePane(paneId) {
      if (!paneId || this.activePaneId === paneId) return
      this.activePaneId = paneId
      const pane = this.findPane(this.paneTree, paneId)
      if (pane?.activeTab) {
        this._rememberContextPath(pane.activeTab)
      }
      this.saveEditorState()
    },

    setActiveTab(paneId, path) {
      const pane = this.findPane(this.paneTree, paneId)
      if (!pane || !path) return
      pane.activeTab = path
      this.activePaneId = paneId
      this._rememberContextPath(path)
      this.saveEditorState()
    },

    setSplitRatio(splitNode, ratio, { persist = false } = {}) {
      void splitNode
      void ratio
      void persist
    },

    commitSplitRatio(splitNode) {
      void splitNode
    },

    updateFilePath(oldPath, newPath) {
      if (!oldPath || !newPath || oldPath === newPath) return

      const walk = (node) => {
        if (!node) return
        if (node.type === 'leaf') {
          const idx = node.tabs.indexOf(oldPath)
          if (idx !== -1) {
            node.tabs.splice(idx, 1, newPath)
            if (node.activeTab === oldPath) node.activeTab = newPath
          }
          return
        }

        for (const child of node.children || []) {
          walk(child)
        }
      }

      walk(this.paneTree)

      const entry = this.recentFiles.find((item) => item.path === oldPath)
      if (entry) {
        entry.path = newPath
        this._persistRecentFiles()
      }

      if (this.lastContextPath === oldPath) {
        this.lastContextPath = newPath
      }

      const dockTabIndex = this.documentDockTabs.indexOf(oldPath)
      if (dockTabIndex !== -1) {
        this.documentDockTabs.splice(dockTabIndex, 1, newPath)
      }
      if (this.activeDocumentDockTab === oldPath) {
        this.activeDocumentDockTab = newPath
      }

      if (this.dirtyFiles.has(oldPath)) {
        this.dirtyFiles.delete(oldPath)
        this.dirtyFiles.add(newPath)
      }

      const nextEditorViews = {}
      for (const [key, view] of Object.entries(this.editorViews)) {
        if (key.endsWith(`:${oldPath}`)) {
          const paneId = key.slice(0, key.indexOf(':'))
          nextEditorViews[`${paneId}:${newPath}`] = view
        } else {
          nextEditorViews[key] = view
        }
      }
      this.editorViews = nextEditorViews

      this.saveEditorState()
    },

    closeFileFromAllPanes(path) {
      if (!path) return

      const leaves = []
      const walk = (node) => {
        if (!node) return
        if (node.type === 'leaf') {
          if ((node.tabs || []).includes(path)) {
            leaves.push(node.id)
          }
          return
        }

        for (const child of node.children || []) {
          walk(child)
        }
      }

      walk(this.paneTree)
      for (const paneId of leaves) {
        this.closeTab(paneId, path)
      }

      this.closeDocumentDockFile(path)

      this.clearFileDirty(path)
    },

    switchTab(delta) {
      const pane = this.activePane
      if (!pane || (pane.tabs || []).length < 2) return
      const idx = pane.tabs.indexOf(pane.activeTab)
      const next = (idx + delta + pane.tabs.length) % pane.tabs.length
      pane.activeTab = pane.tabs[next]
      this._rememberContextPath(pane.activeTab)
      this.saveEditorState()
    },

    reorderTabs(paneId, fromIdx, toIdx) {
      const pane = this.findPane(this.paneTree, paneId)
      if (!pane) return
      if (!reorderPaneTabs(pane, fromIdx, toIdx)) return
      this.saveEditorState()
    },

    registerEditorView(paneId, path, view) {
      return registerEditorRuntimeView(this.editorViews, paneId, path, view)
    },

    unregisterEditorView(paneId, path) {
      return unregisterEditorRuntimeView(this.editorViews, paneId, path)
    },

    getEditorView(paneId, path) {
      return getRegisteredEditorView(this.editorViews, paneId, path)
    },

    getAnyEditorView(path) {
      return getAnyRegisteredEditorView(this.editorViews, path)
    },

    getEditorViewsForPath(path) {
      return getRegisteredEditorViewsForPath(this.editorViews, path)
    },

    recordFileOpen(path) {
      if (!path || isLauncherTab(path) || isPreviewPath(path)) return
      this.recentFiles = buildRecentFilesAfterOpen(this.recentFiles, path)
      this._persistRecentFiles()
    },

    markFileDirty(path) {
      return markDirtyPath(this.dirtyFiles, path)
    },

    clearFileDirty(path) {
      return clearDirtyPath(this.dirtyFiles, path)
    },

    isFileDirty(path) {
      return hasDirtyPath(this.dirtyFiles, path)
    },

    getDirtyFiles(paths = null) {
      return collectDirtyPaths(this.dirtyFiles, paths)
    },

    async persistPath(path, persistOptions = {}) {
      return persistEditorPath({
        path,
        editorViews: this.editorViews,
        filesStore: useFilesStore(),
        persistOptions,
        onPersisted: (savedPath, originalPath = savedPath) => {
          if (originalPath !== savedPath) {
            this.updateFilePath(originalPath, savedPath)
          }
          this.clearFileDirty(savedPath)
        },
      })
    },

    async persistPaths(paths = []) {
      return persistEditorPaths(paths, (path) => this.persistPath(path))
    },

    async loadRecentFiles(workspacePath) {
      this.recentFiles = await loadRecentFilesForWorkspace(useWorkspaceStore().workspaceDataDir, workspacePath)
    },

    applyRecentFilesSnapshot(recentFiles = []) {
      this.recentFiles = Array.isArray(recentFiles) ? recentFiles : []
      return this.recentFiles
    },

    _persistRecentFiles() {
      const workspace = useWorkspaceStore()
      void persistRecentFilesForWorkspace(workspace.workspaceDataDir, workspace.path, this.recentFiles)
    },

    saveEditorState() {
      scheduleEditorStateSave({
        workspaceDataDir: useWorkspaceStore().workspaceDataDir,
        paneTree: this.paneTree,
        activePaneId: this.activePaneId,
        documentDockTabs: this.documentDockTabs,
        activeDocumentDockTab: this.activeDocumentDockTab,
        lastContextPath: this.lastContextPath,
      })
    },

    async saveEditorStateImmediate() {
      await flushEditorStateSave({
        workspaceDataDir: useWorkspaceStore().workspaceDataDir,
        paneTree: this.paneTree,
        activePaneId: this.activePaneId,
        documentDockTabs: this.documentDockTabs,
        activeDocumentDockTab: this.activeDocumentDockTab,
        lastContextPath: this.lastContextPath,
      })
    },

    async restoreEditorState() {
      const workspace = useWorkspaceStore()
      const state = await loadEditorStateSnapshot(workspace.workspaceDataDir)
      if (!state) return false

      this.restoreGeneration += 1
      this.paneTree = state.paneTree || createEmptyEditorRuntimeState().paneTree
      this.activePaneId = state.activePaneId || ROOT_PANE_ID
      this.documentDockTabs = Array.isArray(state.documentDockTabs) ? state.documentDockTabs : []
      this.activeDocumentDockTab = this.documentDockTabs.includes(state.activeDocumentDockTab)
        ? state.activeDocumentDockTab
        : this.documentDockTabs[0] || null
      this.lastContextPath = isContextCandidatePath(state.lastContextPath)
        ? state.lastContextPath
        : null

      return true
    },

    applyEditorSessionState(state = null) {
      if (!state || typeof state !== 'object') return false

      this.restoreGeneration += 1
      this.paneTree = state.paneTree || createEmptyEditorRuntimeState().paneTree
      this.activePaneId = state.activePaneId || ROOT_PANE_ID
      this.documentDockTabs = Array.isArray(state.documentDockTabs) ? state.documentDockTabs : []
      this.activeDocumentDockTab = this.documentDockTabs.includes(state.activeDocumentDockTab)
        ? state.activeDocumentDockTab
        : this.documentDockTabs[0] || null
      this.lastContextPath = isContextCandidatePath(state.lastContextPath)
        ? state.lastContextPath
        : null
      return true
    },

    cleanup() {
      cancelEditorStateSave()
      destroyEditorRuntimeViews(this.editorViews)
      Object.assign(this, createEmptyEditorRuntimeState({
        restoreGeneration: this.restoreGeneration + 1,
      }))
      this._editorOpenRoutingRuntime = null
    },
  },
})
