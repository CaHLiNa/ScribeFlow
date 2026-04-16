import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createAiSessionRecord,
  deriveAiSessionTitle,
  ensureAiSessionsState,
  normalizeAiSessionPermissionMode,
  removeAiSessionRecord,
  updateAiSessionRecord,
} from '../src/domains/ai/aiSessionRuntime.js'

test('createAiSessionRecord builds a normalized empty AI session', () => {
  const session = createAiSessionRecord({ title: 'Draft review' })

  assert.match(session.id, /^ai-session:/)
  assert.equal(session.mode, 'agent')
  assert.equal(session.title, 'Draft review')
  assert.deepEqual(session.messages, [])
  assert.deepEqual(session.artifacts, [])
  assert.deepEqual(session.attachments, [])
  assert.equal(session.permissionMode, 'accept-edits')
  assert.deepEqual(session.permissionRequests, [])
  assert.deepEqual(session.askUserRequests, [])
  assert.deepEqual(session.exitPlanRequests, [])
  assert.deepEqual(session.backgroundTasks, [])
  assert.equal(session.isCompacting, false)
  assert.equal(session.lastCompactAt, 0)
  assert.equal(session.waitingResume, false)
  assert.equal(session.waitingResumeMessage, '')
  assert.deepEqual(session.planMode, { active: false, summary: '', note: '' })
  assert.equal(session.isRunning, false)
})

test('normalizeAiSessionPermissionMode maps Proma and Altals values into stable session modes', () => {
  assert.equal(normalizeAiSessionPermissionMode('per-tool'), 'accept-edits')
  assert.equal(normalizeAiSessionPermissionMode('acceptEdits'), 'accept-edits')
  assert.equal(normalizeAiSessionPermissionMode('bypassPermissions'), 'bypass-permissions')
  assert.equal(normalizeAiSessionPermissionMode('plan'), 'plan')
})

test('deriveAiSessionTitle trims invocation prefixes and long content', () => {
  assert.equal(
    deriveAiSessionTitle('/grounded-chat Tighten the related work framing.', 'Run 1'),
    'Tighten the related work framing.'
  )
  assert.match(
    deriveAiSessionTitle('A'.repeat(80), 'Run 1'),
    /^A{48}…$/
  )
})

test('ensureAiSessionsState creates a fallback session when state is empty', () => {
  const state = ensureAiSessionsState({
    sessions: [],
    currentSessionId: '',
    fallbackTitle: 'Run 1',
  })

  assert.equal(state.sessions.length, 1)
  assert.equal(state.sessions[0].title, 'Run 1')
  assert.equal(state.currentSessionId, state.sessions[0].id)
})

test('ensureAiSessionsState falls back to the first session when current id is missing', () => {
  const first = createAiSessionRecord({ id: 's1', title: 'First run' })
  const second = createAiSessionRecord({ id: 's2', title: 'Second run' })

  const state = ensureAiSessionsState({
    sessions: [first, second],
    currentSessionId: 'missing',
    fallbackTitle: 'Run 1',
  })

  assert.equal(state.currentSessionId, 's1')
})

test('updateAiSessionRecord updates one session immutably', () => {
  const first = createAiSessionRecord({ id: 's1', title: 'First run' })
  const second = createAiSessionRecord({ id: 's2', title: 'Second run' })

  const next = updateAiSessionRecord([first, second], 's2', (session) => ({
    ...session,
    mode: 'chat',
    promptDraft: 'Rewrite this paragraph.',
    isRunning: true,
  }))

  assert.equal(next[0].promptDraft, '')
  assert.equal(next[1].mode, 'chat')
  assert.equal(next[1].promptDraft, 'Rewrite this paragraph.')
  assert.equal(next[1].isRunning, true)
})

test('removeAiSessionRecord deletes the requested session id', () => {
  const first = createAiSessionRecord({ id: 's1', title: 'First run' })
  const second = createAiSessionRecord({ id: 's2', title: 'Second run' })

  const next = removeAiSessionRecord([first, second], 's1')

  assert.deepEqual(next.map((session) => session.id), ['s2'])
})
