import { defineStore } from 'pinia'
import { nextTick } from 'vue'
import { nanoid } from './utils'
import { useFilesStore } from './files'
import { useWorkspaceStore } from './workspace'
import { useChatStore } from './chat'
import { isAiLauncher, isChatTab, getChatSessionId, isNewTab, getViewerType, isPreviewPath, isReferencePath } from '../utils/fileTypes'
import { saveState, loadState, findInvalidTabs } from '../services/editorPersistence'
import { events } from '../services/telemetry'
import { buildCitationText } from '../editor/citationSyntax'
import { buildExecutionResultSnippet } from '../services/executionResultInsert'

// Pane tree: either a leaf (has tabs) or a split (has children)
// { type: 'leaf', id, tabs: [path, ...], activeTab: path }
// { type: 'split', direction: 'horizontal'|'vertical', ratio: 0.5, children: [pane, pane] }

// Debounce timer for editor state persistence
let _saveStateTimer = null

function isLauncherTab(path) {
  return isNewTab(path) || isAiLauncher(path)
}

function isContextCandidatePath(path) {
  return !!path
    && !isChatTab(path)
    && !isLauncherTab(path)
    && !isPreviewPath(path)
    && !isReferencePath(path)
}

function fileBasename(path) {
  return String(path || '').split('/').pop() || ''
}

function fileExtension(path) {
  const name = fileBasename(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function isResearchInsertableTextPath(path) {
  return ['md', 'markdown', 'txt', 'tex', 'latex', 'typ', 'rmd', 'qmd'].includes(fileExtension(path))
}

function buildResearchSourceLine(targetPath, note = {}, annotation = null) {
  const sourceRef = note?.sourceRef || annotation?.sourceRef || {}
  const parts = []
  const page = Number(annotation?.page || sourceRef?.page || 0)
  if (Number.isInteger(page) && page > 0) {
    parts.push(`page ${page}`)
  }
  const referenceKey = annotation?.referenceKey || sourceRef?.referenceKey || null
  if (referenceKey) {
    parts.push(buildCitationText(targetPath, referenceKey))
  } else if (sourceRef?.pdfPath) {
    parts.push(fileBasename(sourceRef.pdfPath))
  }
  const sourceId = sourceRef?.annotationId || annotation?.id || null
  if (sourceId) {
    parts.push(`source_ref: ${sourceId}`)
  }
  return parts.join(' | ')
}

function buildTextResearchNoteSnippet(targetPath, note = {}, annotation = null) {
  const quote = String(note?.quote || annotation?.quote || '').trim()
  const comment = String(note?.comment || '').trim()
  const sourceLine = buildResearchSourceLine(targetPath, note, annotation)
  const sourceRefPayload = note?.sourceRef || null

  const segments = []
  if (quote) {
    segments.push(
      quote
        .split(/\r?\n/)
        .map((line) => `> ${line}`)
        .join('\n'),
    )
  }
  if (comment) {
    segments.push(`Note: ${comment}`)
  }
  if (sourceLine) {
    segments.push(`Source: ${sourceLine}`)
  }
  if (sourceRefPayload) {
    segments.push(`<!-- source_ref: ${JSON.stringify(sourceRefPayload)} -->`)
  }

  return `\n\n${segments.join('\n\n')}\n\n`
}

export const useEditorStore = defineStore('editor', {
  state: () => ({
    paneTree: {
      type: 'leaf',
      id: 'pane-root',
      tabs: [],
      activeTab: null,
    },
    activePaneId: 'pane-root',
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
          node.tabs.forEach((t) => files.add(t))
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
  },

  actions: {
    findPane(node, id) {
      if (!node) return null
      if (node.type === 'leaf' && node.id === id) return node
      if (node.type === 'split' && node.children) {
        for (const child of node.children) {
          const found = this.findPane(child, id)
          if (found) return found
        }
      }
      return null
    },

    findParent(node, id, parent = null) {
      if (!node) return null
      if (node.type === 'leaf' && node.id === id) return parent
      if (node.type === 'split' && node.children) {
        for (const child of node.children) {
          const found = this.findParent(child, id, node)
          if (found !== null) return found
        }
      }
      return null
    },

    /**
     * Walk the pane tree and return the first leaf containing tabPath.
     */
    findPaneWithTab(tabPath) {
      const walk = (node) => {
        if (node.type === 'leaf' && node.tabs.includes(tabPath)) return node
        if (node.type === 'split' && node.children) {
          for (const child of node.children) {
            const found = walk(child)
            if (found) return found
          }
        }
        return null
      }
      return walk(this.paneTree)
    },

    _findNonChatPane() {
      return this._findLeaf(n => !n.activeTab || !isChatTab(n.activeTab))
    },

    _rememberContextPath(path) {
      if (!isContextCandidatePath(path)) return
      this.lastContextPath = path
    },

    /**
     * Walk the pane tree and return the first leaf matching a predicate.
     */
    _findLeaf(predicate) {
      const walk = (node) => {
        if (node.type === 'leaf' && predicate(node)) return node
        if (node.type === 'split' && node.children) {
          for (const child of node.children) {
            const found = walk(child)
            if (found) return found
          }
        }
        return null
      }
      return walk(this.paneTree)
    },

    openFile(path) {
      const pane = this.findPane(this.paneTree, this.activePaneId)
      if (!pane) return

      // If already open in this pane, switch to it
      if (pane.tabs.includes(path)) {
        pane.activeTab = path
        this._rememberContextPath(path)
        if (!isChatTab(path)) this.recordFileOpen(path)
        this.saveEditorState()
        return
      }

      // Smart routing: if the active pane is showing a chat, route file to a
      // different pane so the conversation isn't buried. Focus stays on chat.
      if (pane.activeTab && isChatTab(pane.activeTab) && !isChatTab(path)) {
        // File already open in another pane — switch to it there
        const existingPane = this.findPaneWithTab(path)
        if (existingPane) {
          existingPane.activeTab = path
          this.activePaneId = existingPane.id
          this._rememberContextPath(path)
          if (!isChatTab(path)) this.recordFileOpen(path)
          this.saveEditorState()
          return
        }

        // Find a non-chat pane to host the file
        const altPane = this._findNonChatPane()
        if (altPane && altPane.id !== pane.id) {
          const newtabIdx = altPane.activeTab && isLauncherTab(altPane.activeTab)
            ? altPane.tabs.indexOf(altPane.activeTab)
            : -1
          if (newtabIdx !== -1) {
            altPane.tabs.splice(newtabIdx, 1, path)
          } else {
            altPane.tabs.push(path)
          }
          altPane.activeTab = path
          this.activePaneId = altPane.id
          this._rememberContextPath(path)
          if (!isChatTab(path)) this.recordFileOpen(path)
          this.saveEditorState()
          return
        }

        // Only one pane (the chat pane) — split and open file beside it.
        const newPaneId = this.splitPaneWith(this.activePaneId, 'vertical', path)
        // Move focus to the new file pane
        if (newPaneId) this.activePaneId = newPaneId
        this._rememberContextPath(path)
        if (!isChatTab(path)) this.recordFileOpen(path)
        return
      }

      // Normal flow: open in active pane
      // Replace newtab if it's the active tab (like Chrome replacing blank tab)
      const newtabIdx = pane.activeTab && isLauncherTab(pane.activeTab)
        ? pane.tabs.indexOf(pane.activeTab)
        : -1
      if (newtabIdx !== -1) {
        pane.tabs.splice(newtabIdx, 1, path)
      } else {
        pane.tabs.push(path)
      }
      pane.activeTab = path
      this._rememberContextPath(path)
      if (!isChatTab(path)) this.recordFileOpen(path)
      this._revealInTree(path)
      this.saveEditorState()
    },

    _revealInTree(path) {
      if (isChatTab(path) || isLauncherTab(path)) return
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
      const chatStore = useChatStore()
      const sessionId = options.sessionId || chatStore.createSession()
      const tabPath = `chat:${sessionId}`

      // Check if this chat tab is already open in any pane
      const existingPane = this.findPaneWithTab(tabPath)
      if (existingPane) {
        this.activePaneId = existingPane.id
        existingPane.activeTab = tabPath
        chatStore.activeSessionId = sessionId
        if (options.prefill) {
          nextTick(() => window.dispatchEvent(new CustomEvent('chat-set-input', { detail: { message: options.prefill } })))
        }
        if (options.selection) {
          nextTick(() => window.dispatchEvent(new CustomEvent('chat-with-selection', { detail: options.selection })))
        }
        return
      }

      // Open in specified pane or active pane
      const targetPane = options.paneId
        ? this.findPane(this.paneTree, options.paneId)
        : this.findPane(this.paneTree, this.activePaneId)
      if (targetPane) {
        if (!targetPane.tabs.includes(tabPath)) {
          // Replace newtab if it's the active tab
          const newtabIdx = targetPane.activeTab && isLauncherTab(targetPane.activeTab)
            ? targetPane.tabs.indexOf(targetPane.activeTab)
            : -1
          if (newtabIdx !== -1) {
            targetPane.tabs.splice(newtabIdx, 1, tabPath)
          } else {
            targetPane.tabs.push(tabPath)
          }
        }
        targetPane.activeTab = tabPath
        this.activePaneId = targetPane.id
        this.lastChatPaneId = targetPane.id
      }

      chatStore.activeSessionId = sessionId
      this.saveEditorState()

      // Store for ChatInput to consume on mount (async component may not be mounted yet)
      if (options.prefill) chatStore.pendingPrefill = options.prefill
      if (options.selection) chatStore.pendingSelection = options.selection
    },

    /**
     * Open chat in a side pane (for "Ask AI" flows).
     * Routes to last active chat/newtab pane, or any visible chat/newtab, or splits.
     * @param {Object} options - { sessionId?, prefill?, selection? }
     */
    openChatBeside(options = {}) {
      // 1. Last chat pane the user looked at — if still showing a chat or newtab
      const lastPane = this.lastChatPaneId && this.findPane(this.paneTree, this.lastChatPaneId)
      if (lastPane?.activeTab && (isChatTab(lastPane.activeTab) || isLauncherTab(lastPane.activeTab))) {
        if (isChatTab(lastPane.activeTab)) {
          const sid = getChatSessionId(lastPane.activeTab)
          return this.openChat({ ...options, sessionId: sid, paneId: lastPane.id })
        }
        // Launcher tab — openChat will replace it
        return this.openChat({ ...options, paneId: lastPane.id })
      }

      // 2. Any pane currently showing a chat or launcher tab
      const visible = this._findLeaf(n => n.activeTab && (isChatTab(n.activeTab) || isLauncherTab(n.activeTab)))
      if (visible) {
        if (isChatTab(visible.activeTab)) {
          const sid = getChatSessionId(visible.activeTab)
          return this.openChat({ ...options, sessionId: sid, paneId: visible.id })
        }
        return this.openChat({ ...options, paneId: visible.id })
      }

      // 3. No chat or newtab visible — split and create new
      const chatStore = useChatStore()
      const sid = options.sessionId || chatStore.createSession()
      const tabPath = `chat:${sid}`
      const newPaneId = this.splitPaneWith(this.activePaneId, 'vertical', tabPath)

      chatStore.activeSessionId = sid
      if (newPaneId) this.lastChatPaneId = newPaneId

      if (options.prefill) chatStore.pendingPrefill = options.prefill
      if (options.selection) chatStore.pendingSelection = options.selection
    },

    /**
     * Open a NewTab page as a first-class tab in the target pane.
     * Always creates a fresh tab — Cmd+T should behave like a browser.
     */
    openNewTab(paneId) {
      const targetPane = paneId
        ? this.findPane(this.paneTree, paneId)
        : this.findPane(this.paneTree, this.activePaneId)
      if (!targetPane) return

      const tabPath = `newtab:${nanoid()}`
      targetPane.tabs.push(tabPath)
      targetPane.activeTab = tabPath
      this.saveEditorState()
    },

    openAiLauncher(paneId) {
      const targetPane = paneId
        ? this.findPane(this.paneTree, paneId)
        : this.findPane(this.paneTree, this.activePaneId)
      if (!targetPane) return

      const tabPath = `ai-launcher:${nanoid()}`
      targetPane.tabs.push(tabPath)
      targetPane.activeTab = tabPath
      this.lastChatPaneId = targetPane.id
      this.saveEditorState()
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
          try { useChatStore().saveSession(sid) } catch {}
        }
      }

      // Remove from source
      const fromIdx = fromPane.tabs.indexOf(tabPath)
      if (fromIdx === -1) return
      fromPane.tabs.splice(fromIdx, 1)

      // Update source active tab
      if (fromPane.activeTab === tabPath) {
        fromPane.activeTab = fromPane.tabs.length > 0
          ? fromPane.tabs[Math.min(fromIdx, fromPane.tabs.length - 1)]
          : null
      }

      // Insert into target
      const clampedIdx = Math.min(insertIdx, toPane.tabs.length)
      toPane.tabs.splice(clampedIdx, 0, tabPath)
      toPane.activeTab = tabPath
      this.activePaneId = toPaneId

      // Collapse empty non-root panes
      if (fromPane.tabs.length === 0) {
        const parent = this.findParent(this.paneTree, fromPane.id)
        if (parent) this.collapsePane(fromPane.id)
      }

      this.saveEditorState()
    },

    closeTab(paneId, path) {
      const pane = this.findPane(this.paneTree, paneId)
      if (!pane) return

      const idx = pane.tabs.indexOf(path)
      if (idx === -1) return

      // Auto-save chat sessions on tab close
      if (isChatTab(path)) {
        const sid = getChatSessionId(path)
        if (sid) {
          try { useChatStore().saveSession(sid) } catch {}
        }
      }

      pane.tabs.splice(idx, 1)

      // Update active tab
      if (pane.activeTab === path) {
        if (pane.tabs.length > 0) {
          pane.activeTab = pane.tabs[Math.min(idx, pane.tabs.length - 1)]
          this._rememberContextPath(pane.activeTab)
        } else {
          pane.activeTab = null
        }
      }

      // If pane is now empty: collapse split panes; root pane shows EmptyPane
      if (pane.tabs.length === 0) {
        const parent = this.findParent(this.paneTree, pane.id)
        if (parent) {
          this.collapsePane(pane.id)
        }
      }

      this.saveEditorState()
    },

    collapsePane(paneId) {
      const parent = this.findParent(this.paneTree, paneId)
      if (!parent || parent.type !== 'split') return

      // Find sibling
      const idx = parent.children.findIndex(
        (c) => c.type === 'leaf' && c.id === paneId
      )
      if (idx === -1) return

      const sibling = parent.children[1 - idx]

      // Replace parent with sibling
      Object.keys(parent).forEach((k) => delete parent[k])
      Object.assign(parent, sibling)

      // Update active pane if needed
      if (this.activePaneId === paneId) {
        if (sibling.type === 'leaf') {
          this.activePaneId = sibling.id
        } else {
          // Find first leaf in sibling
          const firstLeaf = this.findFirstLeaf(sibling)
          if (firstLeaf) this.activePaneId = firstLeaf.id
        }
      }
      this.saveEditorState()
    },

    findFirstLeaf(node) {
      if (node.type === 'leaf') return node
      if (node.children) {
        for (const child of node.children) {
          const leaf = this.findFirstLeaf(child)
          if (leaf) return leaf
        }
      }
      return null
    },

    findRightNeighborLeaf(paneId) {
      const walk = (node, trail = []) => {
        if (!node) return null
        if (node.type === 'leaf') {
          return node.id === paneId ? [...trail, node] : null
        }
        for (const child of node.children || []) {
          const found = walk(child, [...trail, node])
          if (found) return found
        }
        return null
      }

      const trail = walk(this.paneTree)
      if (!trail || trail.length < 2) return null

      for (let i = trail.length - 2; i >= 0; i -= 1) {
        const parent = trail[i]
        const child = trail[i + 1]
        if (parent?.type !== 'split' || parent.direction !== 'vertical') continue
        const idx = (parent.children || []).findIndex(candidate => candidate === child)
        if (idx === 0 && parent.children?.[1]) {
          return this.findFirstLeaf(parent.children[1])
        }
      }

      return null
    },

    splitPane(direction) {
      const pane = this.findPane(this.paneTree, this.activePaneId)
      if (!pane) return

      const newPaneId = `pane-${nanoid()}`

      // Clone current pane data
      const currentData = {
        type: 'leaf',
        id: pane.id,
        tabs: [...pane.tabs],
        activeTab: pane.activeTab,
      }

      const newPane = {
        type: 'leaf',
        id: newPaneId,
        tabs: [],
        activeTab: null,
      }

      // Transform current pane into a split
      Object.keys(pane).forEach((k) => delete pane[k])
      Object.assign(pane, {
        type: 'split',
        direction,
        ratio: 0.5,
        children: [currentData, newPane],
      })

      // Focus the new pane
      this.activePaneId = newPaneId
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

      const currentData = {
        type: 'leaf',
        id: pane.id,
        tabs: [...pane.tabs],
        activeTab: pane.activeTab,
      }

      const newPane = {
        type: 'leaf',
        id: newPaneId,
        tabs: [tab],
        activeTab: tab,
      }

      Object.keys(pane).forEach((k) => delete pane[k])
      Object.assign(pane, {
        type: 'split',
        direction,
        ratio: 0.5,
        children: [currentData, newPane],
      })

      // Keep focus on the original pane
      this.activePaneId = paneId
      this.saveEditorState()
      return newPaneId
    },

    openFileInPane(path, paneId, options = {}) {
      const pane = this.findPane(this.paneTree, paneId)
      if (!pane) return null

      if (pane.tabs.includes(path)) {
        pane.activeTab = path
      } else {
        const shouldReplaceNewTab = options.replaceNewTab !== false
          && pane.activeTab
          && isLauncherTab(pane.activeTab)
        if (shouldReplaceNewTab) {
          const idx = pane.tabs.indexOf(pane.activeTab)
          if (idx !== -1) {
            pane.tabs.splice(idx, 1, path)
          } else {
            pane.tabs.push(path)
          }
        } else {
          pane.tabs.push(path)
        }
        pane.activeTab = path
      }

      if (options.activatePane) {
        this.activePaneId = paneId
        this._rememberContextPath(path)
      }

      this.saveEditorState()
      return paneId
    },

    setActivePane(paneId) {
      this.activePaneId = paneId
      const pane = this.findPane(this.paneTree, paneId)
      if (pane?.activeTab) {
        if (isChatTab(pane.activeTab) || isLauncherTab(pane.activeTab)) {
          this.lastChatPaneId = paneId
        }
        this._rememberContextPath(pane.activeTab)
        if (isChatTab(pane.activeTab)) {
          const sid = getChatSessionId(pane.activeTab)
          if (sid) useChatStore().activeSessionId = sid
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
        if (sid) useChatStore().activeSessionId = sid
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
      const [moved] = pane.tabs.splice(fromIdx, 1)
      pane.tabs.splice(toIdx, 0, moved)
      this.saveEditorState()
    },

    registerEditorView(paneId, path, view) {
      const key = `${paneId}:${path}`
      this.editorViews[key] = view
    },

    unregisterEditorView(paneId, path) {
      const key = `${paneId}:${path}`
      delete this.editorViews[key]
    },

    getEditorView(paneId, path) {
      return this.editorViews[`${paneId}:${path}`]
    },

    getAnyEditorView(path) {
      for (const [key, view] of Object.entries(this.editorViews)) {
        if (key.endsWith(`:${path}`)) return view
      }
      return null
    },

    getEditorViewsForPath(path) {
      const views = []
      for (const [key, view] of Object.entries(this.editorViews)) {
        if (key.endsWith(`:${path}`)) {
          views.push(view)
        }
      }
      return views
    },

    findPreferredResearchInsertTarget() {
      const activePath = this.activeTab
      const activePaneId = this.activePaneId
      const activeViewerType = activePath ? getViewerType(activePath) : null

      if (activeViewerType === 'text' && isResearchInsertableTextPath(activePath) && this.getEditorView(activePaneId, activePath)) {
        return { paneId: activePaneId, path: activePath, viewerType: activeViewerType }
      }

      const candidates = []
      const walk = (node) => {
        if (!node) return
        if (node.type === 'leaf') {
          const path = node.activeTab
          if (!path) return
          const viewerType = getViewerType(path)
          if (viewerType === 'text' && isResearchInsertableTextPath(path) && this.getEditorView(node.id, path)) {
            candidates.push({ paneId: node.id, path, viewerType })
          }
          return
        }
        if (node.type === 'split' && Array.isArray(node.children)) {
          node.children.forEach(walk)
        }
      }

      walk(this.paneTree)
      return candidates[0] || null
    },

    findPreferredExecutionResultTarget() {
      const activePath = this.activeTab
      const activePaneId = this.activePaneId
      const activeViewerType = activePath ? getViewerType(activePath) : null

      if (activeViewerType === 'text' && isResearchInsertableTextPath(activePath) && this.getEditorView(activePaneId, activePath)) {
        return { paneId: activePaneId, path: activePath, viewerType: activeViewerType }
      }

      const candidates = []
      const walk = (node) => {
        if (!node) return
        if (node.type === 'leaf') {
          const path = node.activeTab
          if (!path) return
          const viewerType = getViewerType(path)
          if (viewerType === 'text' && isResearchInsertableTextPath(path) && this.getEditorView(node.id, path)) {
            candidates.push({ paneId: node.id, path, viewerType })
          }
          return
        }
        if (node.type === 'split' && Array.isArray(node.children)) {
          node.children.forEach(walk)
        }
      }

      walk(this.paneTree)
      return candidates[0] || null
    },

    insertResearchNoteIntoManuscript(note, annotation = null) {
      const target = this.findPreferredResearchInsertTarget()
      if (!target) {
        return {
          ok: false,
          reason: 'no-target',
        }
      }

      if (target.viewerType === 'text') {
        const view = this.getEditorView(target.paneId, target.path)
        if (!view?.state) {
          return { ok: false, reason: 'missing-editor-view', ...target }
        }

        const selection = view.state.selection.main
        const snippet = buildTextResearchNoteSnippet(target.path, note, annotation)
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: snippet },
          selection: { anchor: selection.from + snippet.length },
          scrollIntoView: true,
        })
        view.focus?.()
        return {
          ok: true,
          ...target,
        }
      }

      return {
        ok: false,
        reason: 'unsupported-target',
        ...target,
      }
    },

    async insertExecutionResultIntoManuscript({ outputs = [], provenance = {} } = {}) {
      const target = this.findPreferredExecutionResultTarget()
      if (!target) {
        return {
          ok: false,
          reason: 'no-target',
        }
      }

      const view = this.getEditorView(target.paneId, target.path)
      if (!view?.state) {
        return {
          ok: false,
          reason: 'missing-editor-view',
          ...target,
        }
      }

      const snippetResult = await buildExecutionResultSnippet(target.path, outputs, provenance)
      if (!snippetResult.ok) {
        return {
          ok: false,
          reason: snippetResult.reason,
          ...target,
        }
      }

      const selection = view.state.selection.main
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: snippetResult.snippet },
        selection: { anchor: selection.from + snippetResult.snippet.length },
        scrollIntoView: true,
      })
      view.focus?.()

      return {
        ok: true,
        ...target,
      }
    },

    recordFileOpen(path) {
      if (path.startsWith('ref:@') || isPreviewPath(path) || isChatTab(path) || isLauncherTab(path)) return
      events.fileOpen(path.split('.').pop())
      this.recentFiles = this.recentFiles.filter(e => e.path !== path)
      this.recentFiles.unshift({ path, openedAt: Date.now() })
      if (this.recentFiles.length > 20) this.recentFiles.length = 20
      this._persistRecentFiles()
    },

    markFileDirty(path) {
      if (!path || this.dirtyFiles.has(path)) return
      this.dirtyFiles.add(path)
    },

    clearFileDirty(path) {
      if (!path || !this.dirtyFiles.has(path)) return
      this.dirtyFiles.delete(path)
    },

    isFileDirty(path) {
      return !!path && this.dirtyFiles.has(path)
    },

    getDirtyFiles(paths = null) {
      const dirty = [...this.dirtyFiles]
      if (!Array.isArray(paths) || paths.length === 0) return dirty
      const allowed = new Set(paths)
      return dirty.filter(path => allowed.has(path))
    },

    async persistPath(path) {
      if (!path) return false

      const view = this.getAnyEditorView(path)
      if (view?.altalsPersist) {
        return (await view.altalsPersist()) !== false
      }

      if (view?.state?.doc) {
        const files = useFilesStore()
        const saved = await files.saveFile(path, view.state.doc.toString())
        if (saved) this.clearFileDirty(path)
        return saved
      }

      const files = useFilesStore()
      const content = files.fileContents[path]
      if (typeof content !== 'string') return false
      const saved = await files.saveFile(path, content)
      if (saved) this.clearFileDirty(path)
      return saved
    },

    async persistPaths(paths = []) {
      const targets = Array.from(new Set(paths.filter(Boolean)))
      let success = true
      for (const path of targets) {
        const saved = await this.persistPath(path)
        if (!saved) success = false
      }
      return success
    },

    loadRecentFiles(workspacePath) {
      try {
        const stored = localStorage.getItem(`recentFiles:${workspacePath}`)
        this.recentFiles = stored ? JSON.parse(stored) : []
      } catch {
        this.recentFiles = []
      }
    },

    _persistRecentFiles() {
      const workspace = useWorkspaceStore()
      if (!workspace.path) return
      localStorage.setItem(`recentFiles:${workspace.path}`, JSON.stringify(this.recentFiles))
    },

    // ====== Editor state persistence ======

    /** Debounced save — called by actions that mutate pane tree or active pane. */
    saveEditorState() {
      clearTimeout(_saveStateTimer)
      _saveStateTimer = setTimeout(() => {
        saveState(useWorkspaceStore().shouldersDir, this.paneTree, this.activePaneId)
      }, 500)
    },

    /** Immediate save (no debounce). Call before workspace close. */
    async saveEditorStateImmediate() {
      clearTimeout(_saveStateTimer)
      await saveState(useWorkspaceStore().shouldersDir, this.paneTree, this.activePaneId)
    },

    /**
     * Optimistic restore: set the pane tree immediately so the UI renders instantly,
     * then validate all tabs in parallel and prune any that no longer exist.
     */
    async restoreEditorState() {
      const workspace = useWorkspaceStore()
      const state = await loadState(workspace.shouldersDir)
      if (!state) return false
      const restoreGeneration = ++this.restoreGeneration
      const restoredWorkspacePath = workspace.path
      const restoredShouldersDir = workspace.shouldersDir

      // Optimistic: apply immediately — UI renders now
      this.paneTree = state.paneTree
      if (state.activePaneId && this.findPane(this.paneTree, state.activePaneId)) {
        this.activePaneId = state.activePaneId
      } else {
        const firstLeaf = this.findFirstLeaf(this.paneTree)
        this.activePaneId = firstLeaf?.id || 'pane-root'
      }

      const restoredActivePane = this.findPane(this.paneTree, this.activePaneId)
      if (isContextCandidatePath(restoredActivePane?.activeTab)) {
        this.lastContextPath = restoredActivePane.activeTab
      } else {
        const firstContextLeaf = this._findLeaf((node) => isContextCandidatePath(node.activeTab))
        this.lastContextPath = firstContextLeaf?.activeTab || null
      }

      // Background: validate all tabs in parallel, close any that are gone
      findInvalidTabs(workspace.shouldersDir, this.paneTree).then(invalidTabs => {
        if (
          restoreGeneration !== this.restoreGeneration
          || workspace.path !== restoredWorkspacePath
          || workspace.shouldersDir !== restoredShouldersDir
        ) {
          return
        }
        if (invalidTabs.size === 0) return
        for (const tab of invalidTabs) {
          this.closeFileFromAllPanes(tab)
        }
        // If active pane was emptied, fall back
        if (!this.findPane(this.paneTree, this.activePaneId)) {
          const firstLeaf = this.findFirstLeaf(this.paneTree)
          this.activePaneId = firstLeaf?.id || 'pane-root'
        }
      }).catch(e => {
        console.error('[editor] Background tab validation failed:', e)
      })

      return true
    },

    cleanup() {
      clearTimeout(_saveStateTimer)
      _saveStateTimer = null

      // Destroy all CodeMirror EditorView instances
      for (const key of Object.keys(this.editorViews)) {
        try { this.editorViews[key]?.destroy() } catch (e) { /* component may already be unmounted */ }
      }
      this.editorViews = {}

      // Reset pane tree to initial empty state
      this.paneTree = { type: 'leaf', id: 'pane-root', tabs: [], activeTab: null }
      this.activePaneId = 'pane-root'
      this.dirtyFiles = new Set()
      this.recentFiles = []
      this.lastContextPath = null
      this.cursorOffset = 0
      this.restoreGeneration += 1
    },
  },
})
