import test from 'node:test'
import assert from 'node:assert/strict'

import { createPinia, setActivePinia } from 'pinia'

import { t } from '../src/i18n/index.js'
import { createWorkflowPlan } from '../src/services/ai/workflowRuns/planner.js'
import { createCheckpoint } from '../src/services/ai/workflowRuns/state.js'
import {
  hydrateSessionWorkflow,
  serializeSessionWorkflow,
  useAiWorkflowRunsStore,
} from '../src/stores/aiWorkflowRuns.js'
import {
  buildPersistedChatSessionData,
  buildPersistedChatSessionMeta,
  hydratePersistedChatSession,
} from '../src/stores/chatSessionPersistence.js'

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function createFakeChatStore(sessionId) {
  const sessions = [{ id: sessionId, label: 'Workflow chat', _workflow: null }]
  const chats = new Map()
  const saves = []

  return {
    sessions,
    saves,
    getChatInstance(id) {
      return chats.get(id) || null
    },
    getOrCreateChat(session) {
      if (chats.has(session.id)) return chats.get(session.id)
      const state = {
        messagesRef: { value: [] },
        pushMessage(message) {
          this.messagesRef.value.push(clone(message))
        },
      }
      const chat = { state }
      chats.set(session.id, chat)
      return chat
    },
    async saveSession(id) {
      const session = sessions.find((item) => item.id === id) || null
      saves.push({
        id,
        workflow: clone(session?._workflow || null),
      })
    },
  }
}

async function waitFor(assertion, { attempts = 20 } = {}) {
  let lastError = null
  for (let index = 0; index < attempts; index += 1) {
    try {
      return assertion()
    } catch (error) {
      lastError = error
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  throw lastError
}

test('workflow session snapshot serializes and hydrates as isolated clones', () => {
  const plan = createWorkflowPlan({
    templateId: 'draft.review-revise',
    context: { currentFile: '/tmp/draft.md' },
  })

  const snapshot = serializeSessionWorkflow(plan)
  assert.ok(snapshot)
  assert.equal(snapshot.template.id, 'draft.review-revise')
  assert.equal(snapshot.run.context.currentFile, '/tmp/draft.md')
  assert.equal(snapshot.run.executionMode, 'foreground')
  assert.equal(snapshot.run.backgroundCapable, true)

  snapshot.run.steps[0].label = 'Mutated outside store'
  const restored = hydrateSessionWorkflow(plan)
  assert.notEqual(restored.run.steps[0].label, 'Mutated outside store')

  assert.equal(hydrateSessionWorkflow(null), null)
  assert.equal(hydrateSessionWorkflow({ template: { id: 'draft.review-revise' } }), null)
})

test('workflow hydration backfills background execution metadata for older snapshots', () => {
  const plan = createWorkflowPlan({ templateId: 'draft.review-revise' })
  const legacySnapshot = {
    template: { ...plan.template },
    run: {
      ...plan.run,
      executionMode: undefined,
      backgroundCapable: undefined,
      lastHeartbeatAt: null,
      resumeHint: 'stale',
    },
  }

  const restored = hydrateSessionWorkflow(legacySnapshot)

  assert.equal(restored.run.executionMode, 'foreground')
  assert.equal(restored.run.backgroundCapable, true)
  assert.equal(restored.run.resumeHint, null)
  assert.ok(restored.run.lastHeartbeatAt)
})

test('workflow run store binds runs to sessions and syncs workflow snapshots', () => {
  setActivePinia(createPinia())
  const store = useAiWorkflowRunsStore()
  const session = { id: 'session-1', _workflow: null }

  const created = store.createRunFromTemplate({
    templateId: 'draft.review-revise',
    sessionId: session.id,
    context: { currentFile: '/tmp/draft.md' },
  })
  const synced = store.syncRunToSession(session)

  assert.equal(store.sessionRunMap[session.id], created.run.id)
  assert.equal(store.activeRunId, created.run.id)
  assert.equal(synced.run.id, created.run.id)
  assert.equal(session._workflow.template.id, 'draft.review-revise')

  session._workflow.run.status = 'tampered'
  assert.equal(store.getRun(created.run.id).run.status, 'planned')
})

test('store can move workflows into background mode and expose them for recovery', () => {
  setActivePinia(createPinia())
  const store = useAiWorkflowRunsStore()
  const session = { id: 'session-background', _workflow: null }

  const created = store.createRunFromTemplate({
    templateId: 'draft.review-revise',
    sessionId: session.id,
    context: { currentFile: '/tmp/draft.md' },
    autoRun: false,
  })

  const updated = store.setRunExecutionMode({
    runId: created.run.id,
    executionMode: 'background',
  })
  const synced = store.syncRunToSession(session)
  const backgroundRuns = store.listBackgroundRuns()
  const description = store.describeRun(created.run.id)

  assert.equal(updated.run.executionMode, 'background')
  assert.equal(backgroundRuns.length, 1)
  assert.equal(backgroundRuns[0].run.id, created.run.id)
  assert.equal(description.executionMode, 'background')
  assert.equal(
    description.resumeHint,
    t('This workflow can be resumed from the AI workbench or chat list.')
  )
  assert.equal(synced.run.executionMode, 'background')
})

test('workflow run store can list the latest runs for a specific context file', () => {
  setActivePinia(createPinia())
  const store = useAiWorkflowRunsStore()

  const draftRun = store.createRunFromTemplate({
    templateId: 'draft.review-revise',
    context: { currentFile: '/tmp/chapter.tex' },
    autoRun: false,
  })
  const diagnoseRun = store.createRunFromTemplate({
    templateId: 'compile.tex-typ-diagnose',
    context: { currentFile: '/tmp/chapter.tex' },
    autoRun: false,
  })
  store.createRunFromTemplate({
    templateId: 'compile.tex-typ-fix',
    context: { currentFile: '/tmp/other.tex' },
    autoRun: false,
  })

  const fileRuns = store.listRunsForFile('/tmp/chapter.tex')
  const compileRuns = store.listRunsForFile('/tmp/chapter.tex', {
    templateIdPrefix: 'compile.tex-typ',
  })
  const latestCompileRun = store.findLatestRunForFile('/tmp/chapter.tex', {
    templateIdPrefix: 'compile.tex-typ',
  })

  assert.equal(fileRuns.length, 2)
  assert.deepEqual(
    new Set(fileRuns.map((workflow) => workflow.run.id)),
    new Set([draftRun.run.id, diagnoseRun.run.id])
  )
  assert.equal(compileRuns.length, 1)
  assert.equal(compileRuns[0].run.id, diagnoseRun.run.id)
  assert.equal(latestCompileRun.run.id, diagnoseRun.run.id)
})

test('workflow sync does not restore stale session snapshots without an explicit binding', () => {
  setActivePinia(createPinia())
  const store = useAiWorkflowRunsStore()
  const plan = createWorkflowPlan({ templateId: 'draft.review-revise' })
  const session = {
    id: 'session-no-binding',
    _workflow: serializeSessionWorkflow(plan),
  }

  const synced = store.syncRunToSession(session)

  assert.equal(synced, null)
  assert.equal(session._workflow, null)
  assert.equal(store.getRun(plan.run.id), null)
})

test('checkpoint decisions update stored runs and run summaries', () => {
  setActivePinia(createPinia())
  const store = useAiWorkflowRunsStore()
  const plan = createWorkflowPlan({ templateId: 'draft.review-revise' })
  const waitingRun = createCheckpoint(plan.run, {
    stepId: plan.run.steps[3].id,
    type: 'apply_patch',
    label: 'Apply patch',
  })

  store.restoreSessionWorkflow('session-2', {
    ...plan,
    run: waitingRun,
  })

  assert.equal(store.activeRunId, waitingRun.id)

  const before = store.describeRun(waitingRun.id)
  assert.equal(before.approvalPending, true)
  assert.equal(before.currentStepLabel, t(plan.run.steps[3].label))

  const updated = store.applyCheckpointDecision({
    runId: waitingRun.id,
    decision: { action: 'apply' },
    resolvedBy: 'reviewer',
  })

  assert.equal(updated.run.checkpoints[0].status, 'resolved')
  assert.equal(updated.run.checkpoints[0].resolvedBy, 'reviewer')
  assert.deepEqual(updated.run.checkpoints[0].payload, { action: 'apply' })

  const after = store.describeRun(waitingRun.id)
  assert.equal(after.approvalPending, false)
  assert.equal(after.status, 'running')
  assert.equal(after.templateId, 'draft.review-revise')
})

test('store auto-executes launched workflow runs and persists visible chat content', async () => {
  setActivePinia(createPinia())
  const store = useAiWorkflowRunsStore()
  const chatStore = createFakeChatStore('session-auto-run')

  store.configureExecutor({ chatStore })
  const created = store.createRunFromTemplate({
    templateId: 'draft.review-revise',
    sessionId: 'session-auto-run',
    context: { currentFile: '/tmp/draft.md', prompt: 'Polish the draft.' },
  })

  assert.equal(created.run.status, 'planned')

  const waiting = await waitFor(() => {
    const workflow = store.getRun(created.run.id)
    assert.equal(workflow.run.status, 'waiting_user')
    return workflow
  })

  const openCheckpoint = waiting.run.checkpoints.find((item) => item.status === 'open')
  assert.equal(waiting.run.currentStepId, waiting.run.steps[4].id)
  assert.equal(openCheckpoint?.type, 'apply_patch')
  assert.ok(chatStore.getChatInstance('session-auto-run').state.messagesRef.value.length > 0)
  assert.ok(chatStore.saves.length > 0)
  assert.equal(chatStore.saves.at(-1)?.id, 'session-auto-run')
})

test('checkpoint resolution resumes execution through the remaining workflow steps', async () => {
  setActivePinia(createPinia())
  const store = useAiWorkflowRunsStore()
  const chatStore = createFakeChatStore('session-resume')

  store.configureExecutor({ chatStore })
  const created = store.createRunFromTemplate({
    templateId: 'draft.review-revise',
    sessionId: 'session-resume',
    context: { currentFile: '/tmp/draft.md', prompt: 'Apply the safe fixes.' },
  })

  const waiting = await waitFor(() => {
    const workflow = store.getRun(created.run.id)
    assert.equal(workflow.run.status, 'waiting_user')
    return workflow
  })

  const checkpointId = waiting.run.checkpoints.find((item) => item.status === 'open')?.id
  const resumed = store.applyCheckpointDecision({
    runId: waiting.run.id,
    checkpointId,
    decision: { action: 'apply' },
    resolvedBy: 'reviewer',
  })

  assert.equal(resumed.run.checkpoints[0].status, 'resolved')

  const completed = await waitFor(() => {
    const workflow = store.getRun(created.run.id)
    assert.equal(workflow.run.status, 'completed')
    return workflow
  })

  assert.equal(completed.run.steps[4].status, 'completed')
  assert.equal(completed.run.steps[5].status, 'completed')
  assert.ok(chatStore.getChatInstance('session-resume').state.messagesRef.value.length > 0)
  assert.ok(chatStore.saves.length >= 2)
})

test('checkpoint resolution persists the resolved snapshot before executor finishes the run', async () => {
  setActivePinia(createPinia())
  const store = useAiWorkflowRunsStore()
  const chatStore = createFakeChatStore('session-durable')
  const plan = createWorkflowPlan({ templateId: 'draft.review-revise' })
  const waitingRun = createCheckpoint(plan.run, {
    stepId: plan.run.steps[4].id,
    type: 'apply_patch',
    label: 'Apply patch',
  })

  store.configureExecutor({ chatStore })
  store.restoreSessionWorkflow('session-durable', {
    ...plan,
    run: waitingRun,
  })

  const updated = store.applyCheckpointDecision({
    runId: waitingRun.id,
    decision: { action: 'apply' },
    resolvedBy: 'reviewer',
  })

  assert.equal(updated.run.checkpoints[0].status, 'resolved')

  const resolvedSave = await waitFor(() => {
    const matched = chatStore.saves.find(
      (entry) =>
        entry.id === 'session-durable' &&
        entry.workflow?.run?.status === 'running' &&
        entry.workflow?.run?.checkpoints?.[0]?.status === 'resolved' &&
        entry.workflow?.run?.currentCheckpointId === null
    )
    assert.ok(matched)
    return matched
  })

  assert.deepEqual(resolvedSave.workflow.run.checkpoints[0].payload, { action: 'apply' })

  await waitFor(() => {
    const workflow = store.getRun(waitingRun.id)
    assert.equal(workflow.run.status, 'completed')
    return workflow
  })
})

test('chat persistence helpers include serialized workflow snapshots in saved data', () => {
  const plan = createWorkflowPlan({
    templateId: 'draft.review-revise',
    context: { currentFile: '/tmp/draft.md' },
  })
  const session = {
    id: 'session-save',
    label: 'Draft review',
    modelId: 'sonnet',
    _aiTitle: true,
    _keywords: ['draft', 'review'],
    _ai: { role: 'reviewer' },
    _workflow: plan,
    createdAt: '2026-03-21T12:00:00.000Z',
    updatedAt: '2026-03-21T12:05:00.000Z',
  }
  const messages = [{ id: 'msg-1', role: 'user', parts: [] }]

  const persisted = buildPersistedChatSessionData(session, messages)

  assert.equal(persisted._workflow.template.id, 'draft.review-revise')
  assert.equal(persisted._workflow.run.context.currentFile, '/tmp/draft.md')
  assert.deepEqual(persisted.messages, messages)

  persisted._workflow.run.status = 'tampered'
  assert.equal(plan.run.status, 'planned')
})

test('chat persistence helpers hydrate restored sessions and tolerate invalid workflow data', () => {
  const plan = createWorkflowPlan({ templateId: 'draft.review-revise' })
  const restored = hydratePersistedChatSession({
    id: 'session-open',
    label: 'Open review',
    modelId: 'sonnet',
    _ai: { role: 'reviewer' },
    _workflow: serializeSessionWorkflow(plan),
    messages: [{ id: 'msg-2', role: 'assistant', parts: [] }],
    createdAt: '2026-03-21T12:00:00.000Z',
    updatedAt: '2026-03-21T12:05:00.000Z',
  })

  assert.equal(restored._workflow.template.id, 'draft.review-revise')
  assert.equal(restored._savedMessages.length, 1)
  restored._workflow.run.status = 'mutated'
  assert.equal(plan.run.status, 'planned')

  const invalid = hydratePersistedChatSession({
    id: 'session-invalid',
    label: 'Broken review',
    _workflow: { template: { id: 'draft.review-revise' } },
  })
  assert.equal(invalid._workflow, null)
  assert.deepEqual(invalid._savedMessages, [])

  const meta = buildPersistedChatSessionMeta(
    {
      id: 'session-meta',
      messages: [],
      _workflow: { template: { id: 'draft.review-revise' } },
    },
    'Untitled'
  )
  assert.equal(meta.label, 'Untitled')
  assert.equal(meta._workflow, null)
})
