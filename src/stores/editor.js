import { defineStore } from 'pinia'
import { nextTick } from 'vue'
import { nanoid } from './utils'
import { useFilesStore } from './files'
import { useWorkspaceStore } from './workspace'
import { useChatStore } from './chat'
import { isChatTab, getChatSessionId, isNewTab, getViewerType } from '../utils/fileTypes'
import { saveState, loadState, findInvalidTabs } from '../services/editorPersistence'
import { events } from '../services/telemetry'

// Pane tree: either a leaf (has tabs) or a split (has children)
// { type: 'leaf', id, tabs: [path, ...], activeTab: path }
// { type: 'split', direction: 'horizontal'|'vertical', ratio: 0.5, children: [pane, pane] }

// Debounce timer for editor state persistence
let _saveStateTimer = null

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

function buildResearchSourceLine(note = {}, annotation = null) {
  const sourceRef = note?.sourceRef || annotation?.sourceRef || {}
  const parts = []
  const page = Number(annotation?.page || sourceRef?.page || 0)
  if (Number.isInteger(page) && page > 0) {
    parts.push(`page ${page}`)
  }
  const referenceKey = annotation?.referenceKey || sourceRef?.referenceKey || null
  if (referenceKey) {
    parts.push(`[@${referenceKey}]`)
  } else if (sourceRef?.pdfPath) {
    parts.push(fileBasename(sourceRef.pdfPath))
  }
  const sourceId = sourceRef?.annotationId || annotation?.id || null
  if (sourceId) {
    parts.push(`source_ref: ${sourceId}`)
  }
  return parts.join(' | ')
}

function buildTextResearchNoteSnippet(note = {}, annotation = null) {
  const quote = String(note?.quote || annotation?.quote || '').trim()
  const comment = String(note?.comment || '').trim()
  const sourceLine = buildResearchSourceLine(note, annotation)
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

function buildDocxResearchNoteSnippet(note = {}, annotation = null) {
  const quote = String(note?.quote || annotation?.quote || '').trim()
  const comment = String(note?.comment || '').trim()
  const sourceLine = buildResearchSourceLine(note, annotation)
  const segments = []

  if (quote) {
    segments.push(`"${quote}"`)
  }
  if (comment) {
    segments.push(`Note: ${comment}`)
  }
  if (sourceLine) {
    segments.push(`Source: ${sourceLine}`)
  }

  return `${segments.join('\n\n')}\n\n`
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
    // SuperDoc instances: key = `${paneId}:${path}` -> { superdoc, aiActions }
    superdocInstances: {},
    // Cursor offset in the active editor (for outline highlight)
    cursorOffset: 0,
    // Bumped on every DOCX editor update (triggers outline re-eval even for attribute-only changes)
    docxUpdateCount: 0,
    // Recent files per workspace (persisted to localStorage)
    recentFiles: [],  // { path, openedAt }
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
          if (!isChatTab(path)) this.recordFileOpen(path)
          this.saveEditorState()
          return
        }

        // Find a non-chat pane to host the file
        const altPane = this._findNonChatPane()
        if (altPane && altPane.id !== pane.id) {
          const newtabIdx = altPane.activeTab && isNewTab(altPane.activeTab)
            ? altPane.tabs.indexOf(altPane.activeTab)
            : -1
          if (newtabIdx !== -1) {
            altPane.tabs.splice(newtabIdx, 1, path)
          } else {
            altPane.tabs.push(path)
          }
          altPane.activeTab = path
          this.activePaneId = altPane.id
          if (!isChatTab(path)) this.recordFileOpen(path)
          this.saveEditorState()
          return
        }

        // Only one pane (the chat pane) — split and open file beside it.
        const newPaneId = this.splitPaneWith(this.activePaneId, 'vertical', path)
        // Move focus to the new file pane
        if (newPaneId) this.activePaneId = newPaneId
        if (!isChatTab(path)) this.recordFileOpen(path)
        return
      }

      // Normal flow: open in active pane
      // Replace newtab if it's the active tab (like Chrome replacing blank tab)
      const newtabIdx = pane.activeTab && isNewTab(pane.activeTab)
        ? pane.tabs.indexOf(pane.activeTab)
        : -1
      if (newtabIdx !== -1) {
        pane.tabs.splice(newtabIdx, 1, path)
      } else {
        pane.tabs.push(path)
      }
      pane.activeTab = path
      if (!isChatTab(path)) this.recordFileOpen(path)
      this._revealInTree(path)
      this.saveEditorState()
    },

    _revealInTree(path) {
      if (isChatTab(path) || isNewTab(path)) return
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
          const newtabIdx = targetPane.activeTab && isNewTab(targetPane.activeTab)
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
      if (lastPane?.activeTab && (isChatTab(lastPane.activeTab) || isNewTab(lastPane.activeTab))) {
        if (isChatTab(lastPane.activeTab)) {
          const sid = getChatSessionId(lastPane.activeTab)
          return this.openChat({ ...options, sessionId: sid, paneId: lastPane.id })
        }
        // NewTab — openChat will replace it
        return this.openChat({ ...options, paneId: lastPane.id })
      }

      // 2. Any pane currently showing a chat or newtab
      const visible = this._findLeaf(n => n.activeTab && (isChatTab(n.activeTab) || isNewTab(n.activeTab)))
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

    /**
     * Split the active pane vertically and open a NewTab in the new pane.
     * Used by Cmd+J — "I want a side pane, let me decide what to do there."
     */
    openNewTabBeside() {
      const tabPath = `newtab:${nanoid()}`
      this.splitPaneWith(this.activePaneId, 'vertical', tabPath)
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
          && isNewTab(pane.activeTab)
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
      }

      this.saveEditorState()
      return paneId
    },

    setActivePane(paneId) {
      this.activePaneId = paneId
      const pane = this.findPane(this.paneTree, paneId)
      if (pane?.activeTab) {
        if (isChatTab(pane.activeTab) || isNewTab(pane.activeTab)) {
          this.lastChatPaneId = paneId
        }
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
      if (isChatTab(path) || isNewTab(path)) {
        this.lastChatPaneId = paneId
      }
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
    },

    switchTab(delta) {
      const pane = this.activePane
      if (!pane || pane.tabs.length < 2) return
      const idx = pane.tabs.indexOf(pane.activeTab)
      const next = (idx + delta + pane.tabs.length) % pane.tabs.length
      pane.activeTab = pane.tabs[next]
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

    registerSuperdoc(paneId, path, superdoc, _reserved, aiActions) {
      this.superdocInstances[`${paneId}:${path}`] = { superdoc, aiActions }
    },

    unregisterSuperdoc(paneId, path) {
      delete this.superdocInstances[`${paneId}:${path}`]
    },

    getSuperdoc(paneId, path) {
      return this.superdocInstances[`${paneId}:${path}`]?.superdoc
    },

    getAnySuperdoc(path) {
      for (const key in this.superdocInstances) {
        if (key.endsWith(`:${path}`)) return this.superdocInstances[key].superdoc
      }
      return null
    },

    getAnyAiActions(path) {
      for (const key in this.superdocInstances) {
        if (key.endsWith(`:${path}`)) return this.superdocInstances[key].aiActions
      }
      return null
    },

    findPreferredResearchInsertTarget() {
      const activePath = this.activeTab
      const activePaneId = this.activePaneId
      const activeViewerType = activePath ? getViewerType(activePath) : null

      if (activeViewerType === 'text' && isResearchInsertableTextPath(activePath) && this.getEditorView(activePaneId, activePath)) {
        return { paneId: activePaneId, path: activePath, viewerType: activeViewerType }
      }
      if (activeViewerType === 'docx' && this.getSuperdoc(activePaneId, activePath)) {
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
          if (viewerType === 'docx' && this.getSuperdoc(node.id, path)) {
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
        const snippet = buildTextResearchNoteSnippet(note, annotation)
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

      if (target.viewerType === 'docx') {
        const superdoc = this.getSuperdoc(target.paneId, target.path)
        const editor = superdoc?.activeEditor
        if (!editor) {
          return { ok: false, reason: 'missing-superdoc', ...target }
        }

        const snippet = buildDocxResearchNoteSnippet(note, annotation)
        if (typeof editor.commands?.insertContent === 'function') {
          editor.commands.insertContent(snippet)
        } else if (editor.view?.dispatch && editor.state?.tr) {
          const { from, to } = editor.state.selection
          editor.view.dispatch(editor.state.tr.insertText(snippet, from, to))
        } else {
          return { ok: false, reason: 'unsupported-docx-editor', ...target }
        }
        editor.view?.focus?.()
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

    bumpDocxUpdate() {
      this.docxUpdateCount++
    },

    recordFileOpen(path) {
      if (path.startsWith('ref:@') || path.startsWith('preview:') || isChatTab(path) || isNewTab(path)) return
      events.fileOpen(path.split('.').pop())
      this.recentFiles = this.recentFiles.filter(e => e.path !== path)
      this.recentFiles.unshift({ path, openedAt: Date.now() })
      if (this.recentFiles.length > 20) this.recentFiles.length = 20
      this._persistRecentFiles()
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

      // Destroy all SuperDoc instances
      for (const key of Object.keys(this.superdocInstances)) {
        try { this.superdocInstances[key]?.superdoc?.destroy() } catch (e) { /* may already be gone */ }
      }
      this.superdocInstances = {}

      // Reset pane tree to initial empty state
      this.paneTree = { type: 'leaf', id: 'pane-root', tabs: [], activeTab: null }
      this.activePaneId = 'pane-root'
      this.dirtyFiles = new Set()
      this.recentFiles = []
      this.cursorOffset = 0
      this.docxUpdateCount = 0
      this.restoreGeneration += 1
    },
  },
})
