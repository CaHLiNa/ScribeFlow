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
  findRightNeighborLeaf,
  ROOT_PANE_ID,
  splitPaneNode,
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
import {
  deriveRestoredEditorRuntimeState,
  validateRestoredEditorTabs,
} from '../domains/editor/editorRestoreRuntime'
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

    activeTab(state) {
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

    findRightNeighborLeaf(paneId) {
      return findRightNeighborLeaf(this.paneTree, paneId)
    },

    getCompanionPaneId(paneId) {
      if (this.paneTree?.type !== 'split' || !Array.isArray(this.paneTree.children)) return null
      const [leftPane, rightPane] = this.paneTree.children
      if (leftPane?.id === paneId) return rightPane?.id || null
      if (rightPane?.id === paneId) return leftPane?.id || null
      return rightPane?.id || leftPane?.id || null
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

    applyBrowserPreviewTabs(tabs = [], activeTab = null) {
      cancelEditorStateSave()
      destroyEditorRuntimeViews(this.editorViews)
      Object.assign(this, createEmptyEditorRuntimeState({
        restoreGeneration: this.restoreGeneration + 1,
      }))
      this._editorOpenRoutingRuntime = null
      this.paneTree = {
        type: 'leaf',
        id: ROOT_PANE_ID,
        tabs: [...tabs],
        activeTab: activeTab || tabs[0] || null,
      }
      this.activePaneId = ROOT_PANE_ID
      this.lastContextPath = activeTab || tabs[0] || null
    },

    openNewTab(paneId = null) {
      return this._getEditorOpenRoutingRuntime().openNewTab(paneId)
    },

    openNewTabBeside() {
      const newPaneId = this.splitPaneWith(this.activePaneId, 'vertical', createNewTabPath())
      if (newPaneId) {
        this.activePaneId = newPaneId
        this.saveEditorState()
      }
      return newPaneId
    },

    openFileInPane(path, paneId, options = {}) {
      if (!path || !paneId) return null
      return this._getEditorOpenRoutingRuntime().openFileInPane(path, paneId, options)
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

    splitPane(direction) {
      const pane = this.findPane(this.paneTree, this.activePaneId)
      if (!pane) return null

      const existingCompanionPaneId = this.getCompanionPaneId(pane.id)
      if (existingCompanionPaneId) {
        this.activePaneId = existingCompanionPaneId
        this.saveEditorState()
        return existingCompanionPaneId
      }

      const newPaneId = `pane-${nanoid()}`
      const newPane = splitPaneNode(this.paneTree, pane.id, newPaneId)
      if (!newPane) return null

      this.activePaneId = newPane.id
      this.saveEditorState()
      return newPane.id
    },

    splitPaneWith(paneId, direction, tab) {
      const pane = this.findPane(this.paneTree, paneId)
      if (!pane || !tab) return null

      const existingCompanionPaneId = this.getCompanionPaneId(paneId)
      if (existingCompanionPaneId) {
        this.openFileInPane(tab, existingCompanionPaneId, { activatePane: false })
        this.activePaneId = paneId
        this.saveEditorState()
        return existingCompanionPaneId
      }

      const newPaneId = `pane-${nanoid()}`
      const newPane = splitPaneNode(this.paneTree, paneId, newPaneId, [tab], tab)
      if (!newPane) return null

      this.activePaneId = paneId
      this.saveEditorState()
      return newPane.id
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
      if (!splitNode || splitNode !== this.paneTree || splitNode.type !== 'split') return
      splitNode.ratio = Math.max(0.15, Math.min(0.85, Number(ratio) || 0.5))
      if (persist) {
        this.saveEditorState()
      }
    },

    commitSplitRatio(splitNode) {
      if (!splitNode || splitNode !== this.paneTree || splitNode.type !== 'split') return
      this.setSplitRatio(splitNode, splitNode.ratio, { persist: true })
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

    async persistPath(path) {
      return persistEditorPath({
        path,
        editorViews: this.editorViews,
        filesStore: useFilesStore(),
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

    loadRecentFiles(workspacePath) {
      this.recentFiles = loadRecentFilesForWorkspace(workspacePath)
    },

    _persistRecentFiles() {
      const workspace = useWorkspaceStore()
      persistRecentFilesForWorkspace(workspace.path, this.recentFiles)
    },

    saveEditorState() {
      scheduleEditorStateSave({
        shouldersDir: useWorkspaceStore().shouldersDir,
        paneTree: this.paneTree,
        activePaneId: this.activePaneId,
        legacyPreviewPaths: this.legacyPreviewPaths,
      })
    },

    async saveEditorStateImmediate() {
      await flushEditorStateSave({
        shouldersDir: useWorkspaceStore().shouldersDir,
        paneTree: this.paneTree,
        activePaneId: this.activePaneId,
        legacyPreviewPaths: this.legacyPreviewPaths,
      })
    },

    async restoreEditorState() {
      const workspace = useWorkspaceStore()
      const state = await loadEditorStateSnapshot(workspace.shouldersDir)
      if (!state) return false

      const restoreGeneration = ++this.restoreGeneration
      const restoredWorkspacePath = workspace.path
      const restoredShouldersDir = workspace.shouldersDir

      Object.assign(this, deriveRestoredEditorRuntimeState({
        state,
        isContextCandidatePath,
      }))

      void validateRestoredEditorTabs({
        shouldersDir: workspace.shouldersDir,
        paneTree: this.paneTree,
        isStillCurrent: () => (
          restoreGeneration === this.restoreGeneration
          && workspace.path === restoredWorkspacePath
          && workspace.shouldersDir === restoredShouldersDir
        ),
        closeInvalidTab: (tab) => this.closeFileFromAllPanes(tab),
        isActivePaneMissing: () => !this.findPane(this.paneTree, this.activePaneId),
        resolveFallbackActivePaneId: () => this.findFirstLeaf(this.paneTree)?.id || ROOT_PANE_ID,
        onActivePaneResolved: (paneId) => {
          this.activePaneId = paneId
        },
        onError: (error) => {
          console.error('[editor] Background tab validation failed:', error)
        },
      })

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
