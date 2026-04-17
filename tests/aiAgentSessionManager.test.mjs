import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDefaultAgentSessionTitle,
  createAgentSessionState,
  createInitialAgentSessionsState,
  deleteAgentSessionState,
  persistAgentSessionsState,
  renameAgentSessionState,
  restoreAgentSessionsState,
  switchAgentSessionState,
} from '../src/services/ai/agentSessionManager.js'

test('buildDefaultAgentSessionTitle delegates to the provided translator', () => {
  const title = buildDefaultAgentSessionTitle((key, vars) => `${key}:${vars.count}`, 3)
  assert.equal(title, 'Run {count}:3')
})

test('restoreAgentSessionsState falls back to an initial session when storage is empty', async () => {
  const state = await restoreAgentSessionsState({
    workspacePath: '/workspace',
    fallbackTitle: 'Run 1',
    loadState: () => null,
  })

  assert.equal(state.sessions.length, 1)
  assert.equal(state.sessions[0].title, 'Run 1')
  assert.equal(state.currentSessionId, state.sessions[0].id)
})

test('restoreAgentSessionsState keeps durable runtime thread ownership while clearing transient flags', async () => {
  const state = await restoreAgentSessionsState({
    workspacePath: '/workspace',
    fallbackTitle: 'Run 1',
    loadState: () => ({
      currentSessionId: 's1',
      sessions: [
        {
          id: 's1',
          title: 'Recovered run',
          runtimeThreadId: 'thr_1',
          runtimeTurnId: 'turn_1',
          runtimeProviderId: 'openai',
          runtimeTransport: 'codex-runtime',
          promptDraft: 'draft',
          queuedPromptDraft: 'queued draft',
          messages: [{ id: 'm1', role: 'assistant', content: 'stale' }],
          artifacts: [{ id: 'a1' }],
          attachments: [{ id: 'file-1', path: '/tmp/a.md' }],
          queuedAttachments: [{ id: 'file-2', path: '/tmp/b.md' }],
          isRunning: true,
          permissionRequests: [{ requestId: 'p1' }],
          askUserRequests: [{ requestId: 'a1' }],
          exitPlanRequests: [{ requestId: 'e1' }],
          backgroundTasks: [{ id: 't1', status: 'running' }],
          isCompacting: true,
          lastCompactAt: 123,
          waitingResume: true,
          waitingResumeMessage: 'waiting',
          planMode: { active: true, summary: 'summary', note: 'note' },
        },
      ],
    }),
  })

  assert.equal(state.sessions.length, 1)
  assert.equal(state.currentSessionId, 's1')
  assert.equal(state.sessions[0].isRunning, false)
  assert.equal(state.sessions[0].runtimeThreadId, 'thr_1')
  assert.equal(state.sessions[0].runtimeTurnId, '')
  assert.equal(state.sessions[0].runtimeProviderId, 'openai')
  assert.equal(state.sessions[0].runtimeTransport, 'codex-runtime')
  assert.equal(state.sessions[0].promptDraft, 'draft')
  assert.equal(state.sessions[0].queuedPromptDraft, 'queued draft')
  assert.deepEqual(state.sessions[0].messages, [])
  assert.deepEqual(state.sessions[0].artifacts, [])
  assert.deepEqual(state.sessions[0].attachments, [{ id: 'file-1', path: '/tmp/a.md' }])
  assert.deepEqual(state.sessions[0].queuedAttachments, [{ id: 'file-2', path: '/tmp/b.md' }])
  assert.deepEqual(state.sessions[0].permissionRequests, [])
  assert.deepEqual(state.sessions[0].askUserRequests, [])
  assert.deepEqual(state.sessions[0].exitPlanRequests, [])
  assert.deepEqual(state.sessions[0].backgroundTasks, [])
  assert.equal(state.sessions[0].isCompacting, false)
  assert.equal(state.sessions[0].lastCompactAt, 0)
  assert.equal(state.sessions[0].waitingResume, false)
  assert.equal(state.sessions[0].waitingResumeMessage, '')
  assert.deepEqual(state.sessions[0].planMode, { active: false, summary: '', note: '' })
  assert.equal(state.sessions[0].lastError, '')
})

test('create, switch, rename, and delete session state transitions stay consistent', async () => {
  const initial = createInitialAgentSessionsState({ fallbackTitle: 'Run 1' })
  const created = await createAgentSessionState({
    workspacePath: '/workspace',
    sessions: initial.sessions,
    currentSessionId: initial.currentSessionId,
    title: 'Second run',
    activate: true,
    mode: 'agent',
    permissionMode: 'accept-edits',
    runCreate: async (payload) => ({
      state: {
        currentSessionId: 's2',
        sessions: [
          {
            id: 's2',
            mode: payload.mode,
            permissionMode: payload.permissionMode,
            runtimeThreadId: '',
            runtimeProviderId: '',
            runtimeTransport: '',
            title: payload.title,
            createdAt: 2,
            updatedAt: 2,
            promptDraft: '',
            queuedPromptDraft: '',
            attachments: [],
            queuedAttachments: [],
          },
          ...payload.sessions,
        ],
      },
      session: {
        id: 's2',
        title: payload.title,
      },
    }),
  })

  const switched = await switchAgentSessionState({
    workspacePath: '/workspace',
    sessions: created.sessions,
    currentSessionId: created.currentSessionId,
    sessionId: initial.currentSessionId,
    runSwitch: async (payload) => ({
      success: true,
      state: {
        currentSessionId: payload.sessionId,
        sessions: payload.sessions,
      },
    }),
  })
  const renamed = await renameAgentSessionState({
    workspacePath: '/workspace',
    sessions: created.sessions,
    currentSessionId: created.currentSessionId,
    sessionId: created.session.id,
    title: 'Renamed run',
    runRename: async (payload) => ({
      success: true,
      state: {
        currentSessionId: payload.currentSessionId,
        sessions: payload.sessions.map((session) =>
          session.id === payload.sessionId ? { ...session, title: payload.title } : session
        ),
      },
      session: {
        id: payload.sessionId,
        title: payload.title,
      },
    }),
  })
  const deleted = await deleteAgentSessionState({
    workspacePath: '/workspace',
    sessions: renamed.sessions,
    currentSessionId: renamed.session.id,
    sessionId: renamed.session.id,
    fallbackTitle: 'Run 1',
    runDelete: async (payload) => ({
      success: true,
      state: {
        currentSessionId: initial.currentSessionId,
        sessions: payload.sessions.filter((session) => session.id !== payload.sessionId),
      },
    }),
  })

  assert.equal(switched.success, true)
  assert.equal(switched.currentSessionId, initial.currentSessionId)
  assert.equal(renamed.success, true)
  assert.equal(renamed.session.title, 'Renamed run')
  assert.equal(deleted.success, true)
  assert.equal(deleted.sessions.length, 1)
})

test('persistAgentSessionsState writes only local overlays instead of full runtime snapshots', async () => {
  let persistedPayload = null

  await persistAgentSessionsState({
    workspacePath: '/workspace',
    currentSessionId: 's1',
    sessions: [
      {
        id: 's1',
        mode: 'agent',
        permissionMode: 'accept-edits',
        runtimeThreadId: 'thr_1',
        runtimeTurnId: 'turn_1',
        runtimeProviderId: 'openai',
        runtimeTransport: 'codex-runtime',
        title: 'Recovered run',
        createdAt: 10,
        updatedAt: 20,
        promptDraft: 'draft',
        queuedPromptDraft: 'queued',
        messages: [{ id: 'm1', role: 'assistant', content: 'runtime message' }],
        artifacts: [{ id: 'a1' }],
        attachments: [{ id: 'file-1', path: '/tmp/a.md' }],
        queuedAttachments: [{ id: 'file-2', path: '/tmp/b.md' }],
        permissionRequests: [{ requestId: 'p1' }],
        askUserRequests: [{ requestId: 'a1' }],
        exitPlanRequests: [{ requestId: 'e1' }],
        backgroundTasks: [{ id: 't1' }],
        isCompacting: true,
        waitingResume: true,
        planMode: { active: true, summary: 'summary', note: 'note' },
        isRunning: true,
        lastError: 'boom',
      },
    ],
    persistState: (_workspacePath, payload) => {
      persistedPayload = payload
    },
  })

  assert.deepEqual(persistedPayload, {
    currentSessionId: 's1',
    sessions: [
      {
        id: 's1',
        mode: 'agent',
        permissionMode: 'accept-edits',
        runtimeThreadId: 'thr_1',
        runtimeProviderId: 'openai',
        runtimeTransport: 'codex-runtime',
        title: 'Recovered run',
        createdAt: 10,
        updatedAt: 20,
        promptDraft: 'draft',
        queuedPromptDraft: 'queued',
        attachments: [{ id: 'file-1', path: '/tmp/a.md' }],
        queuedAttachments: [{ id: 'file-2', path: '/tmp/b.md' }],
      },
    ],
  })
})
