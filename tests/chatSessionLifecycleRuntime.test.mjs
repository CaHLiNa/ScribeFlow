import test from 'node:test'
import assert from 'node:assert/strict'

import { createChatSessionLifecycleRuntime } from '../src/domains/chat/chatSessionLifecycleRuntime.js'

function createHarness() {
  const state = {
    sessions: [],
    allSessionsMeta: [],
    activeSessionId: null,
  }
  const chatMap = new Map()
  const artifactStops = []
  const clearedSessions = []
  const clearedBindings = []
  const restoredWorkflows = []
  const syncedArtifacts = []
  const disposedChats = []
  const deletedFiles = []
  const savedSessions = []
  const warnings = []

  const runtime = createChatSessionLifecycleRuntime({
    getSessions: () => state.sessions,
    getAllSessionsMeta: () => state.allSessionsMeta,
    getActiveSessionId: () => state.activeSessionId,
    setActiveSessionId: (id) => {
      state.activeSessionId = id
    },
    getShouldersDir: () => '/workspace/.altals',
    getDefaultModelId: () => 'sonnet',
    createSessionId: () => `session-${state.sessions.length + 1}`,
    buildSessionLabel: (number) => `Chat ${number}`,
    now: () => '2026-03-22T00:00:00.000Z',
    ensureChatInstance: (session) => {
      chatMap.set(session.id, {
        state: {
          messagesRef: { value: session.messages || [] },
          statusRef: { value: 'ready' },
        },
        stop() {},
      })
    },
    getChatInstance: (id) => chatMap.get(id) || null,
    stopArtifactSync: (id) => artifactStops.push(id),
    clearSessionArtifacts: (id) => clearedSessions.push(id),
    clearSessionBinding: (id) => clearedBindings.push(id),
    restoreSessionWorkflow: (id, workflow) => restoredWorkflows.push({ id, workflow }),
    syncSessionArtifacts: (session, messages) => syncedArtifacts.push({ id: session.id, messageCount: messages.length }),
    disposeChatInstance: (id) => {
      disposedChats.push(id)
      chatMap.delete(id)
    },
    deletePersistedSession: (id) => deletedFiles.push(id),
    readPersistedSession: async (id) => JSON.stringify({
      id,
      label: 'Persisted chat',
      messages: [{ id: 'm1', role: 'user' }],
      _workflow: { id: 'wf-1' },
    }),
    hydratePersistedChatSession: (data) => ({
      id: data.id,
      label: data.label,
      messages: data.messages,
      _workflow: data._workflow,
    }),
    saveSession: async (id) => savedSessions.push(id),
    warn: (...args) => warnings.push(args),
  })

  return {
    state,
    chatMap,
    runtime,
    artifactStops,
    clearedSessions,
    clearedBindings,
    restoredWorkflows,
    syncedArtifacts,
    disposedChats,
    deletedFiles,
    savedSessions,
    warnings,
  }
}

test('chat session lifecycle runtime creates sessions and seeds chat instances', () => {
  const { state, chatMap, runtime } = createHarness()

  const id = runtime.createSession()

  assert.equal(id, 'session-1')
  assert.equal(state.sessions.length, 1)
  assert.equal(state.sessions[0].modelId, 'sonnet')
  assert.equal(state.activeSessionId, 'session-1')
  assert.ok(chatMap.has('session-1'))
})

test('chat session lifecycle runtime applies ai metadata and syncs artifacts for live chats', () => {
  const { runtime, syncedArtifacts } = createHarness()

  const id = runtime.createSession()
  syncedArtifacts.length = 0

  const session = runtime.setSessionAiMeta(id, {
    role: 'draft',
    source: 'launcher',
    allowedTools: ['search'],
    initialToolChoice: 'required',
    seedArtifacts: [{ id: 'a1' }],
  })

  assert.equal(session._ai.role, 'draft')
  assert.deepEqual(session._ai.allowedTools, ['search'])
  assert.equal(session._ai.initialToolChoice, 'required')
  assert.deepEqual(session._ai.seedArtifacts, [{ id: 'a1' }])
  assert.deepEqual(syncedArtifacts, [{ id, messageCount: 0 }])
})

test('chat session lifecycle runtime deletes sessions and updates active session fallback', async () => {
  const { state, runtime, artifactStops, clearedSessions, clearedBindings, disposedChats, deletedFiles } = createHarness()

  state.sessions.push({ id: 's1', label: 'One', messages: [] }, { id: 's2', label: 'Two', messages: [] })
  state.allSessionsMeta.push({ id: 's1' }, { id: 's2' })
  state.activeSessionId = 's1'

  await runtime.deleteSession('s1')

  assert.deepEqual(state.sessions.map((session) => session.id), ['s2'])
  assert.deepEqual(state.allSessionsMeta.map((meta) => meta.id), ['s2'])
  assert.equal(state.activeSessionId, 's2')
  assert.deepEqual(artifactStops, ['s1'])
  assert.deepEqual(clearedSessions, ['s1'])
  assert.deepEqual(clearedBindings, ['s1'])
  assert.deepEqual(disposedChats, ['s1'])
  assert.deepEqual(deletedFiles, ['s1'])
})

test('chat session lifecycle runtime archives ready chats by saving and removing them', async () => {
  const { state, chatMap, runtime, savedSessions, clearedSessions } = createHarness()

  state.sessions.push({ id: 's1', label: 'One', messages: [] })
  state.activeSessionId = 's1'
  chatMap.set('s1', {
    state: {
      messagesRef: { value: [{ id: 'm1', role: 'user' }] },
      statusRef: { value: 'ready' },
    },
    stop() {},
  })

  await runtime.archiveAndNewChat()

  assert.deepEqual(savedSessions, ['s1'])
  assert.deepEqual(clearedSessions, ['s1'])
  assert.equal(state.sessions.at(-1).id, 'session-1')
  assert.equal(state.activeSessionId, 'session-1')
})

test('chat session lifecycle runtime reopens persisted sessions and marks streaming chats as background', async () => {
  const { state, chatMap, runtime, restoredWorkflows } = createHarness()

  state.sessions.push({ id: 'live', label: 'Live', messages: [] })
  state.activeSessionId = 'live'
  chatMap.set('live', {
    state: {
      messagesRef: { value: [{ id: 'm1', role: 'user' }] },
      statusRef: { value: 'streaming' },
    },
    stop() {},
  })

  await runtime.reopenSession('persisted')

  assert.equal(state.sessions[0]._background, true)
  assert.equal(state.sessions.at(-1).id, 'persisted')
  assert.equal(state.activeSessionId, 'persisted')
  assert.deepEqual(restoredWorkflows, [{ id: 'persisted', workflow: { id: 'wf-1' } }])
})
