import { defineStore } from 'pinia'
import { nextTick } from 'vue'
import { nanoid } from './utils'
import { useFilesStore } from './files'
import { useWorkspaceStore } from './workspace'
import {
  appendChatSession,
  chatSessions,
  createChatSessionRecord,
  setChatActiveSessionId,
  setChatPendingPrefill,
  setChatPendingSelection,
} from './chatSessionState.js'
import { t } from '../i18n'
import { isAiLauncher, isAiWorkbenchPath, isChatTab, getChatSessionId, isLibraryPath, isNewTab, isPreviewPath, isReferencePath } from '../utils/fileTypes'
import { events } from '../services/telemetry'
import {
  closeEditorSurface,
  collectLegacySurfaceTabs,
  openEditorSurface,
  toggleEditorSurface,
} from '../domains/editor/editorSurfaces'
import {
  collapsePaneNode,
  findFirstLeaf as findFirstEditorLeaf,
  findLeaf as findEditorLeaf,
  findPane as findEditorPane,
  findPaneWithTab as findEditorPaneWithTab,
  findParent as findEditorParent,
  findRightNeighborLeaf as findRightEditorNeighborLeaf,
  ROOT_PANE_ID,
  splitPaneNode,
} from '../domains/editor/paneTreeLayout'
import {
  closePaneTab,
  movePaneTab,
  reorderPaneTabs as reorderEditorPaneTabs,
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
  findPreferredTextInsertTarget,
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
  insertExecutionResultIntoEditor,
  insertResearchNoteIntoEditor,
} from '../domains/editor/editorInsertActions'
import {
  createEmptyEditorRuntimeState,
  destroyEditorRuntimeViews,
} from '../domains/editor/editorCleanupRuntime'
import {
  deriveRestoredEditorRuntimeState,
  restoreLegacyEditorSurface,
  validateRestoredEditorTabs,
} from '../domains/editor/editorRestoreRuntime'
import { createEditorOpenRoutingRuntime } from '../domains/editor/editorOpenRoutingRuntime'

// Pane tree: either a leaf (has tabs) or a split (has children)
// { type: 'leaf', id, tabs: [path, ...], activeTab: path }
// { type: 'split', direction: 'horizontal'|'vertical', ratio: 0.5, children: [pane, pane] }

function isLauncherTab(path) {
  return isNewTab(path) || isAiLauncher(path)
}

function isContextCandidatePath(path) {
  return !!path
    && !isChatTab(path)
    && !isLibraryPath(path)
    && !isLauncherTab(path)
    && !isPreviewPath(path)
    && !isReferencePath(path)
}

function fileExtension(path) {
  const name = String(path || '').split('/').pop() || ''
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function isResearchInsertableTextPath(path) {
  return ['md', 'markdown', 'txt', 'tex', 'latex', 'typ', 'rmd', 'qmd'].includes(fileExtension(path))
}

function dropLegacyPreviewPath(legacyPreviewPaths, path) {
  if (!isPreviewPath(path) || !legacyPreviewPaths.has(path)) return legacyPreviewPaths
  const next = new Set(legacyPreviewPaths)
  next.delete(path)
  return next
}

async function resolveChatStore() {
  const { useChatStore } = await import('./chat.js')
  return useChatStore()
}

export const useEditorStore = defineStore('editor', {
  state: () => ({
    paneTree: {
      type: 'leaf',
      id: ROOT_PANE_ID,
      tabs: [],
      activeTab: null,
    },
    activePaneId: ROOT_PANE_ID,
    // Track which editors have unsaved changes
    dirtyFiles: new Set(),
    // Editor view instances (not persisted)
    editorViews: {},
    // Cursor offset in the active editor (for outline highlight)
    cursorOffset: 0,
    // Recent files per workspace (persisted to localStorage)
    recentFiles: [],  // { path, openedAt }
    // Last real file the user focused; used by AI launcher context resolution
    lastContextPath: null,
    // Last pane the user viewed that had a chat or newtab as its active tab
    lastChatPaneId: null,
    // Invalidate async restore validation work when switching workspaces.
    restoreGeneration: 0,
    // Legacy preview pseudo-tabs restored from older pane-first persistence.
    legacyPreviewPaths: new Set(),
  }),

  getters: {
    activePane(state) {
      return this.findPane(state.paneTree, state.activePaneId)
    },

    activeTab(state) {
      const pane = this.findPane(state.paneTree, state.activePaneId)
      return pane?.activeTab || null
    },

    allOpenFiles(state) {
      const files = new Set()
      const walk = (node) => {
        if (node.type === 'leaf') {
          node.tabs.forEach((t) => {
            files.add(t)
          })
        } else if (node.children) {
          node.children.forEach(walk)
        }
      }
      walk(state.paneTree)
      return files
    },

    recentFilesForEmptyState(state) {
      const filesStore = useFilesStore()
      const flatPaths = new Set(filesStore.flatFiles.map(f => f.path))
      return state.recentFiles
        .filter(entry => flatPaths.has(entry.path))
        .slice(0, 5)
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

    isLegacyPreviewTab(state) {
      return (path) => state.legacyPreviewPaths.has(path)
    },
  },

  actions: {
    findPane(node, id) {
      return findEditorPane(node, id)
    },

    findParent(node, id, parent = null) {
      return findEditorParent(node, id, parent)
    },

    /**
     * Walk the pane tree and return the first leaf containing tabPath.
     */
    findPaneWithTab(tabPath) {
      return findEditorPaneWithTab(this.paneTree, tabPath)
    },

    _rememberContextPath(path) {
      if (!isContextCandidatePath(path)) return
      this.lastContextPath = path
    },

    /**
     * Walk the pane tree and return the first leaf matching a predicate.
     */
    _findLeaf(predicate) {
      return findEditorLeaf(this.paneTree, predicate)
    },

    _getEditorOpenRoutingRuntime() {
      if (!this._editorOpenRoutingRuntime) {
        this._editorOpenRoutingRuntime = createEditorOpenRoutingRuntime({
          getActivePaneId: () => this.activePaneId,
          setActivePaneId: (paneId) => {
            this.activePaneId = paneId
          },
          getLastChatPaneId: () => this.lastChatPaneId,
          setLastChatPaneId: (paneId) => {
            this.lastChatPaneId = paneId
          },
          findPane: (paneId) => this.findPane(this.paneTree, paneId),
          findPaneWithTab: (tabPath) => this.findPaneWithTab(tabPath),
          findLeaf: (predicate) => this._findLeaf(predicate),
          splitPaneWith: (paneId, direction, tab) => this.splitPaneWith(paneId, direction, tab),
          rememberContextPath: (path) => this._rememberContextPath(path),
          recordFileOpen: (path) => this.recordFileOpen(path),
          revealInTree: (path) => this._revealInTree(path),
          saveEditorState: () => this.saveEditorState(),
          createChatSession: () => appendChatSession(createChatSessionRecord({
            label: t('Chat {number}', { number: chatSessions.value.length + 1 }),
            modelId: useWorkspaceStore().selectedModelId
              || useWorkspaceStore().modelsConfig?.models?.find((model) => model.default)?.id
              || 'sonnet',
          })),
          setActiveChatSessionId: (sessionId) => {
            setChatActiveSessionId(sessionId)
          },
          setPendingChatPrefill: (value) => {
            setChatPendingPrefill(value)
          },
          setPendingChatSelection: (value) => {
            setChatPendingSelection(value)
          },
          dispatchChatPrefill: (message) => {
            nextTick(() => {
              window.dispatchEvent(new CustomEvent('chat-set-input', {
                detail: { message },
              }))
            })
          },
          dispatchChatSelection: (selection) => {
            nextTick(() => {
              window.dispatchEvent(new CustomEvent('chat-with-selection', {
                detail: selection,
              }))
            })
          },
          createNewTabPath: () => `newtab:${nanoid()}`,
          createAiLauncherPath: () => `ai-launcher:${nanoid()}`,
        })
      }
      return this._editorOpenRoutingRuntime
    },

    openFile(path) {
      return this._getEditorOpenRoutingRuntime().openFile(path)
    },

    openAiWorkbenchSurface(viewId = 'workspace') {
      return openEditorSurface({
        workspace: useWorkspaceStore(),
        surface: 'ai',
        pruneLegacySurfaceTabs: () => this.pruneLegacySurfaceTabs(),
      })
    },

    closeAiWorkbenchSurface(viewId = 'workspace') {
      return closeEditorSurface({
        workspace: useWorkspaceStore(),
        surface: 'ai',
      })
    },

    toggleAiWorkbenchSurface(viewId = 'workspace') {
      return toggleEditorSurface({
        workspace: useWorkspaceStore(),
        surface: 'ai',
        pruneLegacySurfaceTabs: () => this.pruneLegacySurfaceTabs(),
      })
    },

    openLibrarySurface(viewId = 'global') {
      return openEditorSurface({
        workspace: useWorkspaceStore(),
        surface: 'library',
        pruneLegacySurfaceTabs: () => this.pruneLegacySurfaceTabs(),
      })
    },

    closeLibrarySurface(viewId = 'global') {
      return closeEditorSurface({
        workspace: useWorkspaceStore(),
        surface: 'library',
      })
    },

    toggleLibrarySurface(viewId = 'global') {
      return toggleEditorSurface({
        workspace: useWorkspaceStore(),
        surface: 'library',
        pruneLegacySurfaceTabs: () => this.pruneLegacySurfaceTabs(),
      })
    },

    pruneLegacySurfaceTabs() {
      const legacyTabs = collectLegacySurfaceTabs(this.paneTree)
      if (legacyTabs.length === 0) return false

      for (const entry of legacyTabs) {
        this.closeTab(entry.paneId, entry.tab)
      }
      return true
    },

    _revealInTree(path) {
      if (isChatTab(path) || isLibraryPath(path) || isLauncherTab(path) || isAiWorkbenchPath(path)) return
      const workspace = useWorkspaceStore()
      const files = useFilesStore()
      if (!workspace.path || !path.startsWith(workspace.path)) return
      void files.revealPath(path)
    },

    /**
     * Open a chat session as a tab.
     * @param {Object} options - { sessionId?, prefill?, selection?, paneId? }
     */
    openChat(options = {}) {
      return this._getEditorOpenRoutingRuntime().openChat(options)
    },

    /**
     * Open chat in a side pane (for "Ask AI" flows).
     * Routes to last active chat/newtab pane, or any visible chat/newtab, or splits.
     * @param {Object} options - { sessionId?, prefill?, selection? }
     */
    openChatBeside(options = {}) {
      return this._getEditorOpenRoutingRuntime().openChatBeside(options)
    },

    /**
     * Open a NewTab page as a first-class tab in the target pane.
     * Always creates a fresh tab — Cmd+T should behave like a browser.
     */
    openNewTab(paneId) {
      return this._getEditorOpenRoutingRuntime().openNewTab(paneId)
    },

    openAiLauncher(paneId) {
      return this._getEditorOpenRoutingRuntime().openAiLauncher(paneId)
    },

    /**
     * Split the active pane vertically and open a NewTab in the new pane.
     * Used by Cmd+J — "I want a side pane, let me decide what to do there."
     */
    openNewTabBeside() {
      const tabPath = `newtab:${nanoid()}`
      this.splitPaneWith(this.activePaneId, 'vertical', tabPath)
    },

    openAiLauncherBeside() {
      const tabPath = `ai-launcher:${nanoid()}`
      const newPaneId = this.splitPaneWith(this.activePaneId, 'vertical', tabPath)
      if (newPaneId) this.lastChatPaneId = newPaneId
    },

    /**
     * Move a tab from one pane to another (cross-pane drag).
     * If same pane, delegates to reorderTabs.
     */
    moveTabToPane(fromPaneId, tabPath, toPaneId, insertIdx) {
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

      // Don't add if already in target
      if (toPane.tabs.includes(tabPath)) return

      // Auto-save chat session before moving
      if (isChatTab(tabPath)) {
        const sid = getChatSessionId(tabPath)
        if (sid) {
          void resolveChatStore().then((chatStore) => {
            chatStore.saveSession(sid)
          }).catch(() => {})
        }
      }

      const result = movePaneTab(fromPane, toPane, tabPath, insertIdx)
      if (!result.moved) return
      this.activePaneId = toPaneId

      // Collapse empty non-root panes
      if (result.sourceEmpty) {
        const parent = this.findParent(this.paneTree, fromPane.id)
        if (parent) this.collapsePane(fromPane.id)
      }

      this.saveEditorState()
    },

    closeTab(paneId, path) {
      const pane = this.findPane(this.paneTree, paneId)
      if (!pane) return

      const existingIdx = pane.tabs.indexOf(path)
      if (existingIdx === -1) return

      // Auto-save chat sessions on tab close
      if (isChatTab(path)) {
        const sid = getChatSessionId(path)
        if (sid) {
          void resolveChatStore().then((chatStore) => {
            chatStore.saveSession(sid)
          }).catch(() => {})
        }
      }

      const result = closePaneTab(pane, path)
      if (!result.closed) return
      this.legacyPreviewPaths = dropLegacyPreviewPath(this.legacyPreviewPaths, path)
      if (result.activeTab) {
        this._rememberContextPath(result.activeTab)
      }

      // If pane is now empty: collapse split panes; root pane shows EmptyPane
      if (result.isEmpty) {
        const parent = this.findParent(this.paneTree, pane.id)
        if (parent) {
          this.collapsePane(pane.id)
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

    findFirstLeaf(node) {
      return findFirstEditorLeaf(node)
    },

    findRightNeighborLeaf(paneId) {
      return findRightEditorNeighborLeaf(this.paneTree, paneId)
    },

    splitPane(direction) {
      const pane = this.findPane(this.paneTree, this.activePaneId)
      if (!pane) return

      const newPaneId = `pane-${nanoid()}`
      const newPane = splitPaneNode(pane, direction, newPaneId)
      if (!newPane) return

      // Focus the new pane
      this.activePaneId = newPane.id
      this.saveEditorState()
    },

    /**
     * Split a pane and immediately set the new pane's tab.
     * Avoids the race condition where splitPane + nextTick causes a
     * transient mount of the wrong component in the new pane.
     */
    splitPaneWith(paneId, direction, tab) {
      const pane = this.findPane(this.paneTree, paneId)
      if (!pane) return null

      const newPaneId = `pane-${nanoid()}`
      const newPane = splitPaneNode(pane, direction, newPaneId, [tab], tab)
      if (!newPane) return null

      // Keep focus on the original pane
      this.activePaneId = paneId
      this.saveEditorState()
      return newPane.id
    },

    openFileInPane(path, paneId, options = {}) {
      return this._getEditorOpenRoutingRuntime().openFileInPane(path, paneId, options)
    },

    setActivePane(paneId) {
      if (this.activePaneId === paneId) return
      this.activePaneId = paneId
      const pane = this.findPane(this.paneTree, paneId)
      if (pane?.activeTab) {
        if (isChatTab(pane.activeTab) || isLauncherTab(pane.activeTab)) {
          this.lastChatPaneId = paneId
        }
        this._rememberContextPath(pane.activeTab)
        if (isChatTab(pane.activeTab)) {
          const sid = getChatSessionId(pane.activeTab)
          if (sid) setChatActiveSessionId(sid)
        }
      }
      this.saveEditorState()
    },

    setActiveTab(paneId, path) {
      const pane = this.findPane(this.paneTree, paneId)
      if (!pane) return
      pane.activeTab = path
      if (isChatTab(path) || isLauncherTab(path)) {
        this.lastChatPaneId = paneId
      }
      this._rememberContextPath(path)
      if (isChatTab(path)) {
        const sid = getChatSessionId(path)
        if (sid) setChatActiveSessionId(sid)
      }
    },

    setSplitRatio(splitNode, ratio) {
      splitNode.ratio = Math.max(0.15, Math.min(0.85, ratio))
      this.saveEditorState()
    },

    updateFilePath(oldPath, newPath) {
      const walk = (node) => {
        if (node.type === 'leaf') {
          const idx = node.tabs.indexOf(oldPath)
          if (idx !== -1) {
            node.tabs[idx] = newPath
            if (node.activeTab === oldPath) node.activeTab = newPath
          }
        } else if (node.children) {
          node.children.forEach(walk)
        }
      }
      walk(this.paneTree)

      // Update in recent files
      const entry = this.recentFiles.find(e => e.path === oldPath)
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
      this.saveEditorState()
    },

    closeFileFromAllPanes(path) {
      const leaves = []
      const walk = (node) => {
        if (node.type === 'leaf' && node.tabs.includes(path)) {
          leaves.push(node)
        } else if (node.children) {
          node.children.forEach(walk)
        }
      }
      walk(this.paneTree)
      for (const pane of leaves) {
        this.closeTab(pane.id, path)
      }
      this.clearFileDirty(path)
    },

    switchTab(delta) {
      const pane = this.activePane
      if (!pane || pane.tabs.length < 2) return
      const idx = pane.tabs.indexOf(pane.activeTab)
      const next = (idx + delta + pane.tabs.length) % pane.tabs.length
      pane.activeTab = pane.tabs[next]
      this._rememberContextPath(pane.activeTab)
    },

    reorderTabs(paneId, fromIdx, toIdx) {
      const pane = this.findPane(this.paneTree, paneId)
      if (!pane || fromIdx === toIdx) return
      if (!reorderEditorPaneTabs(pane, fromIdx, toIdx)) return
      this.saveEditorState()
    },

    registerEditorView(paneId, path, view) {
      registerEditorRuntimeView(this.editorViews, paneId, path, view)
    },

    unregisterEditorView(paneId, path) {
      unregisterEditorRuntimeView(this.editorViews, paneId, path)
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

    findPreferredResearchInsertTarget() {
      return findPreferredTextInsertTarget({
        paneTree: this.paneTree,
        activePaneId: this.activePaneId,
        editorViews: this.editorViews,
        isInsertablePath: isResearchInsertableTextPath,
      })
    },

    findPreferredExecutionResultTarget() {
      return findPreferredTextInsertTarget({
        paneTree: this.paneTree,
        activePaneId: this.activePaneId,
        editorViews: this.editorViews,
        isInsertablePath: isResearchInsertableTextPath,
      })
    },

    insertResearchNoteIntoManuscript(note, annotation = null) {
      return insertResearchNoteIntoEditor({
        target: this.findPreferredResearchInsertTarget(),
        editorViews: this.editorViews,
        note,
        annotation,
      })
    },

    async insertExecutionResultIntoManuscript({ outputs = [], provenance = {} } = {}) {
      return insertExecutionResultIntoEditor({
        target: this.findPreferredExecutionResultTarget(),
        editorViews: this.editorViews,
        outputs,
        provenance,
      })
    },

    recordFileOpen(path) {
      if (path.startsWith('ref:@') || isPreviewPath(path) || isChatTab(path) || isLauncherTab(path)) return
      events.fileOpen(path.split('.').pop())
      this.recentFiles = buildRecentFilesAfterOpen(this.recentFiles, path)
      this._persistRecentFiles()
    },

    markFileDirty(path) {
      markDirtyPath(this.dirtyFiles, path)
    },

    clearFileDirty(path) {
      clearDirtyPath(this.dirtyFiles, path)
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
        onPersisted: (savedPath) => this.clearFileDirty(savedPath),
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

    // ====== Editor state persistence ======

    /** Debounced save — called by actions that mutate pane tree or active pane. */
    saveEditorState() {
      scheduleEditorStateSave({
        shouldersDir: useWorkspaceStore().shouldersDir,
        paneTree: this.paneTree,
        activePaneId: this.activePaneId,
        legacyPreviewPaths: this.legacyPreviewPaths,
      })
    },

    /** Immediate save (no debounce). Call before workspace close. */
    async saveEditorStateImmediate() {
      await flushEditorStateSave({
        shouldersDir: useWorkspaceStore().shouldersDir,
        paneTree: this.paneTree,
        activePaneId: this.activePaneId,
        legacyPreviewPaths: this.legacyPreviewPaths,
      })
    },

    /**
     * Optimistic restore: set the pane tree immediately so the UI renders instantly,
     * then validate all tabs in parallel and prune any that no longer exist.
     */
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

      restoreLegacyEditorSurface(workspace, state.legacyPrimarySurface)

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
    },
  },
})
