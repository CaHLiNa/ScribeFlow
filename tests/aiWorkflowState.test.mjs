import test from 'node:test'
import assert from 'node:assert/strict'

import {
  attachArtifact,
  createCheckpoint,
  createWorkflowRun,
  createWorkflowStep,
  markRunPlanned,
  markRunRunning,
  markStepCompleted,
  markStepFailed,
  markStepRunning,
  resolveCheckpoint,
} from '../src/services/ai/workflowRuns/state.js'

test('workflow run enters waiting_user when a checkpoint is created', () => {
  const run = createWorkflowRun({
    templateId: 'draft.review-revise',
    steps: [createWorkflowStep({ kind: 'generate_patch', label: 'Generate patch' })],
  })

  const planned = markRunPlanned(run)
  const running = markRunRunning(planned)
  const stepped = markStepRunning(running, running.steps[0].id)
  const waiting = createCheckpoint(stepped, {
    stepId: running.steps[0].id,
    type: 'apply_patch',
  })

  assert.equal(waiting.status, 'waiting_user')
  assert.equal(waiting.checkpoints.at(-1).status, 'open')
  assert.equal(waiting.currentStepId, running.steps[0].id)
  assert.equal(waiting.currentCheckpointId, waiting.checkpoints.at(-1).id)
})

test('run transitions from draft to planned to running', () => {
  const run = createWorkflowRun({
    templateId: 'draft.review-revise',
    steps: [createWorkflowStep({ kind: 'read_context', label: 'Read context' })],
  })

  const planned = markRunPlanned(run)
  const running = markRunRunning(planned)

  assert.equal(run.status, 'draft')
  assert.equal(planned.status, 'planned')
  assert.equal(running.status, 'running')
})

test('browser-safe ID generation works without crypto.randomUUID', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: undefined,
  })

  try {
    const run = createWorkflowRun({ templateId: 'draft.review-revise' })
    assert.match(run.id, /^workflow-run-[a-z0-9]+-[a-z0-9]+$/)
  } finally {
    Object.defineProperty(globalThis, 'crypto', descriptor)
  }
})

test('checkpoint resolve keeps waiting_user when another checkpoint remains open', () => {
  const run = markRunRunning(markRunPlanned(createWorkflowRun({
    templateId: 'draft.review-revise',
    steps: [
      createWorkflowStep({ id: 'step-1', kind: 'generate_patch', label: 'Generate patch' }),
      createWorkflowStep({ id: 'step-2', kind: 'summarize_outcome', label: 'Summarize outcome' }),
    ],
  })))
  const firstWaiting = createCheckpoint(markStepRunning(run, 'step-1'), {
    stepId: 'step-1',
    type: 'apply_patch',
  })
  const secondWaiting = createCheckpoint(firstWaiting, {
    stepId: 'step-2',
    type: 'user_review',
  })
  const resolved = resolveCheckpoint(secondWaiting, firstWaiting.checkpoints[0].id)

  assert.equal(resolved.status, 'waiting_user')
  assert.equal(resolved.currentCheckpointId, secondWaiting.checkpoints[1].id)
  assert.equal(resolved.currentStepId, 'step-2')
  assert.equal(resolved.checkpoints[0].status, 'resolved')
  assert.equal(resolved.checkpoints[1].status, 'open')
})

test('checkpoint resolve returns the run to running when no open checkpoints remain', () => {
  const run = markRunRunning(markRunPlanned(createWorkflowRun({
    templateId: 'draft.review-revise',
    steps: [createWorkflowStep({ kind: 'generate_patch', label: 'Generate patch' })],
  })))
  const stepped = markStepRunning(run, run.steps[0].id)
  const waiting = createCheckpoint(stepped, {
    stepId: run.steps[0].id,
    type: 'apply_patch',
  })
  const resolved = resolveCheckpoint(waiting, waiting.checkpoints[0].id)

  assert.equal(waiting.status, 'waiting_user')
  assert.equal(resolved.status, 'running')
  assert.equal(resolved.checkpoints[0].status, 'resolved')
  assert.equal(resolved.currentCheckpointId, null)
})

test('step failure moves the run into failed', () => {
  const run = markRunRunning(markRunPlanned(createWorkflowRun({
    templateId: 'draft.review-revise',
    steps: [createWorkflowStep({ kind: 'generate_patch', label: 'Generate patch' })],
  })))
  const stepped = markStepRunning(run, run.steps[0].id)
  const failed = markStepFailed(stepped, run.steps[0].id, new Error('boom'))

  assert.equal(failed.status, 'failed')
  assert.equal(failed.steps[0].status, 'failed')
  assert.equal(failed.error.message, 'boom')
  assert.equal(failed.currentStepId, null)
})

test('completed steps and artifacts are tracked on the run', () => {
  const run = markRunRunning(markRunPlanned(createWorkflowRun({
    templateId: 'draft.review-revise',
    steps: [createWorkflowStep({ kind: 'generate_patch', label: 'Generate patch' })],
  })))
  const stepped = markStepRunning(run, run.steps[0].id)
  const completed = markStepCompleted(stepped, run.steps[0].id)
  const withArtifact = attachArtifact(completed, { id: 'art-1', type: 'patch' })

  assert.equal(completed.steps[0].status, 'completed')
  assert.equal(completed.currentStepId, null)
  assert.equal(withArtifact.artifacts.length, 1)
  assert.deepEqual(withArtifact.artifacts[0], { id: 'art-1', type: 'patch' })
})

test('invalid step ids are true no-ops for run status', () => {
  const run = createWorkflowRun({
    templateId: 'draft.review-revise',
    steps: [createWorkflowStep({ kind: 'generate_patch', label: 'Generate patch' })],
  })
  const waiting = createCheckpoint(markRunRunning(markRunPlanned(markStepRunning(run, run.steps[0].id))), {
    stepId: run.steps[0].id,
    type: 'apply_patch',
  })

  const completedNoop = markStepCompleted(waiting, 'missing-step')
  const failedNoop = markStepFailed(waiting, 'missing-step', new Error('ignored'))

  assert.equal(completedNoop.status, 'waiting_user')
  assert.equal(completedNoop.currentCheckpointId, waiting.currentCheckpointId)
  assert.equal(failedNoop.status, 'waiting_user')
  assert.equal(failedNoop.currentCheckpointId, waiting.currentCheckpointId)
})
