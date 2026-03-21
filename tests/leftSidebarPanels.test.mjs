import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveOutlineResizeHeights } from '../src/composables/useLeftSidebarPanels.js'
import { describeWorkflowHeader, getPendingCheckpoint } from '../src/components/ai/workflowUi.js'

test('resolveOutlineResizeHeights keeps the refs+outline stack total constant', () => {
  const result = resolveOutlineResizeHeights({
    startRefHeight: 250,
    startOutlineHeight: 220,
    delta: 40,
  })

  assert.equal(result.refHeight + result.outlineHeight, 470)
  assert.equal(result.outlineHeight, 260)
  assert.equal(result.refHeight, 210)
})

test('resolveOutlineResizeHeights clamps to minimum heights', () => {
  const result = resolveOutlineResizeHeights({
    startRefHeight: 120,
    startOutlineHeight: 120,
    delta: 200,
  })

  assert.equal(result.outlineHeight, 180)
  assert.equal(result.refHeight, 60)
})

test('describeWorkflowHeader summarizes workflow title, template, status, step, and artifact count', () => {
  const workflow = {
    template: {
      id: 'draft.review-revise',
      label: 'Review and revise draft',
    },
    run: {
      title: 'Revise introduction',
      status: 'waiting_user',
      currentStepId: 'step-2',
      artifacts: [{ id: 'artifact-1' }, { id: 'artifact-2' }],
      steps: [
        { id: 'step-1', label: 'Read context', status: 'completed' },
        { id: 'step-2', label: 'Await patch decision', status: 'running' },
      ],
    },
  }

  assert.deepEqual(describeWorkflowHeader(workflow), {
    title: 'Revise introduction',
    templateLabel: 'Review and revise draft',
    status: 'waiting_user',
    currentStepLabel: 'Await patch decision',
    artifactCount: 2,
  })
})

test('describeWorkflowHeader falls back to workflow label when run title is absent', () => {
  const workflow = {
    template: {
      id: 'references.search-intake',
      label: 'Search and intake references',
    },
    run: {
      status: 'running',
      steps: [],
      artifacts: null,
    },
  }

  assert.deepEqual(describeWorkflowHeader(workflow), {
    title: 'Search and intake references',
    templateLabel: 'Search and intake references',
    status: 'running',
    currentStepLabel: null,
    artifactCount: 0,
  })
})

test('getPendingCheckpoint returns the current open checkpoint when present', () => {
  const workflow = {
    run: {
      currentCheckpointId: 'checkpoint-2',
      checkpoints: [
        { id: 'checkpoint-1', status: 'resolved', label: 'Old checkpoint' },
        { id: 'checkpoint-2', status: 'open', type: 'apply_patch', label: 'Apply patch' },
      ],
    },
  }

  assert.deepEqual(getPendingCheckpoint(workflow), {
    id: 'checkpoint-2',
    status: 'open',
    type: 'apply_patch',
    label: 'Apply patch',
  })
})

test('getPendingCheckpoint returns null when there is no open checkpoint', () => {
  const workflow = {
    run: {
      currentCheckpointId: null,
      checkpoints: [
        { id: 'checkpoint-1', status: 'resolved', label: 'Done' },
      ],
    },
  }

  assert.equal(getPendingCheckpoint(workflow), null)
})
