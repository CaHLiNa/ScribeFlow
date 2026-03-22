import test from 'node:test'
import assert from 'node:assert/strict'

import { createEditorOpenRoutingRuntime } from '../src/domains/editor/editorOpenRoutingRuntime.js'
import {
  findLeaf,
  findPane,
  findPaneWithTab,
  ROOT_PANE_ID,
  splitPaneNode,
} from '../src/domains/editor/paneTreeLayout.js'

function createEditorState() {
  return {
    paneTree: {
      type: 'leaf',
      id: ROOT_PANE_ID,
      tabs: [],
      activeTab: null,
    },
    activePaneId: ROOT_PANE_ID,
    lastChatPaneId: null,
    lastContextPath: null,
  }
}

function splitRootPane(state, {
  leftTabs = [],
  leftActiveTab = null,
  rightTabs = [],
  rightActiveTab = null,
  rightPaneId = 'pane-right',
} = {}) {
  state.paneTree.tabs = [...leftTabs]
  state.paneTree.activeTab = leftActiveTab
  const rightPane = splitPaneNode(
    state.paneTree,
    'vertical',
    rightPaneId,
    [...rightTabs],
    rightActiveTab,
  )
  return {
    leftPane: state.paneTree.children[0],
    rightPane,
  }
}

function createRuntime(state, overrides = {}) {
  const events = {
    saves: 0,
    recorded: [],
    revealed: [],
    dispatched: [],
    createdSessions: [],
    activeChatSessionId: null,
    pendingPrefill: null,
    pendingSelection: null,
  }

  let generatedId = 0
  let createdSessionCount = 0

  const runtime = createEditorOpenRoutingRuntime({
    getActivePaneId: () => state.activePaneId,
    setActivePaneId: (paneId) => {
      state.activePaneId = paneId
    },
    getLastChatPaneId: () => state.lastChatPaneId,
    setLastChatPaneId: (paneId) => {
      state.lastChatPaneId = paneId
    },
    findPane: (paneId) => findPane(state.paneTree, paneId),
    findPaneWithTab: (tabPath) => findPaneWithTab(state.paneTree, tabPath),
    findLeaf: (predicate) => findLeaf(state.paneTree, predicate),
    splitPaneWith: (paneId, direction, tabPath) => {
      const pane = findPane(state.paneTree, paneId)
      if (!pane) return null
      generatedId += 1
      const newPane = splitPaneNode(pane, direction, `pane-generated-${generatedId}`, [tabPath], tabPath)
      if (!newPane) return null
      state.activePaneId = paneId
      events.saves += 1
      return newPane.id
    },
    rememberContextPath: (path) => {
      state.lastContextPath = path
    },
    recordFileOpen: (path) => {
      events.recorded.push(path)
    },
    revealInTree: (path) => {
      events.revealed.push(path)
    },
    saveEditorState: () => {
      events.saves += 1
    },
    createChatSession: () => {
      createdSessionCount += 1
      const sessionId = `session-${createdSessionCount}`
      events.createdSessions.push(sessionId)
      return sessionId
    },
    setActiveChatSessionId: (sessionId) => {
      events.activeChatSessionId = sessionId
    },
    setPendingChatPrefill: (value) => {
      events.pendingPrefill = value
    },
    setPendingChatSelection: (value) => {
      events.pendingSelection = value
    },
    dispatchChatPrefill: (message) => {
      events.dispatched.push({ type: 'prefill', message })
    },
    dispatchChatSelection: (selection) => {
      events.dispatched.push({ type: 'selection', selection })
    },
    createNewTabPath: () => {
      generatedId += 1
      return `newtab:generated-${generatedId}`
    },
    createAiLauncherPath: () => {
      generatedId += 1
      return `ai-launcher:generated-${generatedId}`
    },
    ...overrides,
  })

  return { runtime, events }
}

test('openFile routes a document into an existing non-chat pane when the active pane is chat', () => {
  const state = createEditorState()
  const { leftPane, rightPane } = splitRootPane(state, {
    leftTabs: ['chat:session-a'],
    leftActiveTab: 'chat:session-a',
    rightTabs: ['/workspace/notes.md'],
    rightActiveTab: '/workspace/notes.md',
  })
  state.activePaneId = leftPane.id

  const { runtime, events } = createRuntime(state)
  runtime.openFile('/workspace/draft.md')

  assert.deepEqual(rightPane.tabs, ['/workspace/notes.md', '/workspace/draft.md'])
  assert.equal(rightPane.activeTab, '/workspace/draft.md')
  assert.equal(state.activePaneId, rightPane.id)
  assert.equal(state.lastContextPath, '/workspace/draft.md')
  assert.deepEqual(events.recorded, ['/workspace/draft.md'])
  assert.deepEqual(events.revealed, [])
  assert.equal(events.saves, 1)
})

test('openFile splits a lone chat pane and focuses the new file pane', () => {
  const state = createEditorState()
  state.paneTree.tabs = ['chat:session-a']
  state.paneTree.activeTab = 'chat:session-a'

  const { runtime, events } = createRuntime(state)
  runtime.openFile('/workspace/draft.md')

  const filePane = findPaneWithTab(state.paneTree, '/workspace/draft.md')
  assert.ok(filePane)
  assert.equal(state.paneTree.type, 'split')
  assert.equal(filePane.activeTab, '/workspace/draft.md')
  assert.equal(state.activePaneId, filePane.id)
  assert.equal(state.lastContextPath, '/workspace/draft.md')
  assert.deepEqual(events.recorded, ['/workspace/draft.md'])
  assert.equal(events.saves, 1)
})

test('openChat reuses an existing chat tab and dispatches prefill and selection immediately', () => {
  const state = createEditorState()
  const { leftPane, rightPane } = splitRootPane(state, {
    leftTabs: ['/workspace/draft.md'],
    leftActiveTab: '/workspace/draft.md',
    rightTabs: ['chat:session-a'],
    rightActiveTab: 'chat:session-a',
  })
  state.activePaneId = leftPane.id

  const { runtime, events } = createRuntime(state)
  runtime.openChat({
    sessionId: 'session-a',
    prefill: 'Review this draft',
    selection: { text: 'Selected text' },
  })

  assert.equal(state.activePaneId, rightPane.id)
  assert.equal(rightPane.activeTab, 'chat:session-a')
  assert.equal(events.activeChatSessionId, 'session-a')
  assert.deepEqual(events.dispatched, [
    { type: 'prefill', message: 'Review this draft' },
    { type: 'selection', selection: { text: 'Selected text' } },
  ])
  assert.equal(events.pendingPrefill, null)
  assert.equal(events.pendingSelection, null)
  assert.equal(events.saves, 0)
})

test('openChatBeside reuses a visible launcher pane before splitting', () => {
  const state = createEditorState()
  const { leftPane, rightPane } = splitRootPane(state, {
    leftTabs: ['/workspace/draft.md'],
    leftActiveTab: '/workspace/draft.md',
    rightTabs: ['newtab:starter'],
    rightActiveTab: 'newtab:starter',
  })
  state.activePaneId = leftPane.id

  const { runtime, events } = createRuntime(state)
  runtime.openChatBeside({ prefill: 'Summarise the current section' })

  assert.equal(events.createdSessions.length, 1)
  assert.deepEqual(rightPane.tabs, [`chat:${events.createdSessions[0]}`])
  assert.equal(rightPane.activeTab, `chat:${events.createdSessions[0]}`)
  assert.equal(state.activePaneId, rightPane.id)
  assert.equal(state.lastChatPaneId, rightPane.id)
  assert.equal(events.activeChatSessionId, events.createdSessions[0])
  assert.equal(events.pendingPrefill, 'Summarise the current section')
  assert.equal(events.saves, 1)
})

test('openNewTab appends a fresh tab and openAiLauncher marks the pane as chat-adjacent', () => {
  const state = createEditorState()
  const { runtime, events } = createRuntime(state)

  runtime.openNewTab()
  runtime.openAiLauncher()

  assert.deepEqual(state.paneTree.tabs, [
    'newtab:generated-1',
    'ai-launcher:generated-2',
  ])
  assert.equal(state.paneTree.activeTab, 'ai-launcher:generated-2')
  assert.equal(state.lastChatPaneId, ROOT_PANE_ID)
  assert.equal(events.saves, 2)
})

test('openFileInPane replaces launcher tabs by default and can preserve them when asked', () => {
  const replacingState = createEditorState()
  const { leftPane, rightPane } = splitRootPane(replacingState, {
    leftTabs: ['/workspace/draft.md'],
    leftActiveTab: '/workspace/draft.md',
    rightTabs: ['newtab:starter'],
    rightActiveTab: 'newtab:starter',
  })
  replacingState.activePaneId = leftPane.id

  const replacing = createRuntime(replacingState)
  const paneId = replacing.runtime.openFileInPane('/workspace/preview.md', rightPane.id, {
    activatePane: true,
  })

  assert.equal(paneId, rightPane.id)
  assert.deepEqual(rightPane.tabs, ['/workspace/preview.md'])
  assert.equal(rightPane.activeTab, '/workspace/preview.md')
  assert.equal(replacingState.activePaneId, rightPane.id)
  assert.equal(replacingState.lastContextPath, '/workspace/preview.md')
  assert.equal(replacing.events.saves, 1)

  const preservingState = createEditorState()
  const { rightPane: preservingPane } = splitRootPane(preservingState, {
    leftTabs: ['/workspace/draft.md'],
    leftActiveTab: '/workspace/draft.md',
    rightTabs: ['newtab:starter'],
    rightActiveTab: 'newtab:starter',
  })

  const preserving = createRuntime(preservingState)
  preserving.runtime.openFileInPane('/workspace/preview.md', preservingPane.id, {
    replaceNewTab: false,
  })

  assert.deepEqual(preservingPane.tabs, ['newtab:starter', '/workspace/preview.md'])
  assert.equal(preservingPane.activeTab, '/workspace/preview.md')
  assert.equal(preserving.events.saves, 1)
})
