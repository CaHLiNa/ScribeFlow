const RUN_STATUSES = new Set(['draft', 'planned', 'running', 'waiting_user', 'completed', 'failed'])
const STEP_STATUSES = new Set(['pending', 'running', 'completed', 'failed'])
const CHECKPOINT_STATUSES = new Set(['open', 'resolved'])

let idCounter = 0

function now() {
  return new Date().toISOString()
}

function createId(prefix) {
  const browserUUID = globalThis.crypto?.randomUUID?.()
  if (browserUUID) return `${prefix}-${browserUUID}`

  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`
}

function clone(value) {
  if (value == null) return value
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value))
}

function normalizeStatus(value, allowed, fallback) {
  const text = String(value || '').trim()
  return allowed.has(text) ? text : fallback
}

function normalizeError(error) {
  if (!error) return null
  if (typeof error === 'string') {
    return { name: 'Error', message: error }
  }
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack || null,
    }
  }
  if (typeof error === 'object') {
    const message = String(error.message || error.reason || error.error || '').trim()
    if (!message) return null
    return {
      name: String(error.name || 'Error'),
      message,
      stack: typeof error.stack === 'string' ? error.stack : null,
    }
  }
  return {
    name: 'Error',
    message: String(error),
  }
}

function normalizeArtifact(artifact = {}) {
  const value = clone(artifact) || {}
  return {
    id: String(value.id || createId('artifact')),
    ...value,
  }
}

function normalizeStep(step = {}, index = 0, runId = '') {
  const value = clone(step) || {}
  const status = normalizeStatus(value.status, STEP_STATUSES, 'pending')
  return {
    ...value,
    id: String(value.id || `${runId ? `${runId}:` : ''}step-${index + 1}`),
    kind: String(value.kind || value.type || 'step'),
    label: String(value.label || value.kind || `Step ${index + 1}`),
    description: String(value.description || ''),
    requiresApproval: Boolean(value.requiresApproval),
    status,
    attemptCount: Number.isFinite(value.attemptCount) && value.attemptCount > 0 ? value.attemptCount : 0,
    error: normalizeError(value.error),
    startedAt: value.startedAt || null,
    completedAt: value.completedAt || null,
    failedAt: value.failedAt || null,
  }
}

function normalizeCheckpoint(checkpoint = {}, runId = '', stepId = '') {
  const value = clone(checkpoint) || {}
  const status = normalizeStatus(value.status, CHECKPOINT_STATUSES, 'open')
  return {
    ...value,
    id: String(value.id || createId('checkpoint')),
    runId: String(value.runId || runId || ''),
    stepId: String(value.stepId || stepId || ''),
    type: String(value.type || 'checkpoint'),
    label: String(value.label || ''),
    status,
    createdAt: value.createdAt || now(),
    resolvedAt: value.resolvedAt || null,
    resolvedBy: value.resolvedBy || null,
    payload: clone(value.payload) || null,
  }
}

function anyOpenCheckpoint(run) {
  return (run.checkpoints || []).some((checkpoint) => checkpoint.status === 'open')
}

function firstOpenCheckpoint(run) {
  return (run.checkpoints || []).find((checkpoint) => checkpoint.status === 'open') || null
}

function allStepsCompleted(run) {
  return (run.steps || []).length > 0 && run.steps.every((step) => step.status === 'completed')
}

function withRunUpdate(run, patch = {}) {
  return {
    ...clone(run),
    ...patch,
    updatedAt: now(),
  }
}

function withStepUpdate(run, stepId, updater) {
  const base = clone(run)
  let matched = false
  const steps = (base.steps || []).map((step) => {
    if (step.id !== stepId) return step
    matched = true
    return updater(step)
  })
  if (!matched) return { run: base, matched: false }
  return {
    run: {
      ...base,
      steps,
      updatedAt: now(),
    },
    matched: true,
  }
}

export function createWorkflowStep(step = {}) {
  return normalizeStep(step)
}

export function createWorkflowRun({ templateId = '', title = '', context = {}, steps = [] } = {}) {
  const runId = createId('workflow-run')
  return {
    id: runId,
    templateId: String(templateId || ''),
    title: String(title || ''),
    context: clone(context) || {},
    status: 'draft',
    steps: steps.map((step, index) => normalizeStep(step, index, runId)),
    checkpoints: [],
    artifacts: [],
    currentStepId: null,
    currentCheckpointId: null,
    error: null,
    createdAt: now(),
    updatedAt: now(),
  }
}

export function markRunPlanned(run) {
  return withRunUpdate(run, {
    status: 'planned',
  })
}

export function markRunRunning(run) {
  return withRunUpdate(run, {
    status: 'running',
    error: null,
  })
}

export function markRunCompleted(run) {
  return withRunUpdate(run, {
    status: 'completed',
    error: null,
  })
}

export function markRunFailed(run, error = null) {
  return withRunUpdate(run, {
    status: 'failed',
    error: normalizeError(error),
  })
}

export function markStepRunning(run, stepId) {
  const startedAt = now()
  const result = withStepUpdate(run, stepId, (step) => ({
    ...step,
    status: 'running',
    attemptCount: (Number(step.attemptCount) || 0) + 1,
    startedAt: step.startedAt || startedAt,
    error: null,
  }))
  if (!result.matched) return result.run
  return {
    ...result.run,
    currentStepId: stepId,
  }
}

export function markStepCompleted(run, stepId) {
  const completedAt = now()
  const result = withStepUpdate(run, stepId, (step) => ({
    ...step,
    status: 'completed',
    completedAt,
    error: null,
  }))
  if (!result.matched) return result.run
  const nextRun = result.run
  if (anyOpenCheckpoint(nextRun)) return nextRun
  if (allStepsCompleted(nextRun)) {
    return {
      ...markRunCompleted(nextRun),
      currentStepId: null,
    }
  }
  return withRunUpdate(nextRun, {
    status: nextRun.status === 'failed' ? 'failed' : 'running',
    currentStepId: nextRun.currentStepId === stepId ? null : nextRun.currentStepId,
  })
}

export function markStepFailed(run, stepId, error = null) {
  const failedAt = now()
  const result = withStepUpdate(run, stepId, (step) => ({
    ...step,
    status: 'failed',
    failedAt,
    error: normalizeError(error),
  }))
  if (!result.matched) return result.run
  return markRunFailed(
    {
      ...result.run,
      currentStepId: result.run.currentStepId === stepId ? null : result.run.currentStepId,
    },
    error,
  )
}

export function createCheckpoint(run, checkpoint = {}) {
  const targetStepId = String(checkpoint.stepId || run.currentStepId || '')
  const nextCheckpoint = normalizeCheckpoint(checkpoint, run.id, targetStepId)
  const nextRun = {
    ...clone(run),
    checkpoints: [...(run.checkpoints || []), nextCheckpoint],
    currentCheckpointId: nextCheckpoint.id,
    currentStepId: targetStepId || run.currentStepId || null,
    status: 'waiting_user',
    updatedAt: now(),
  }
  return nextRun
}

export function resolveCheckpoint(run, checkpointId, resolution = {}) {
  const resolvedAt = now()
  let matched = false
  const checkpoints = (run.checkpoints || []).map((checkpoint) => {
    if (checkpoint.id !== checkpointId) return checkpoint
    matched = true
    return {
      ...checkpoint,
      status: 'resolved',
      resolvedAt,
      resolvedBy: resolution.resolvedBy || checkpoint.resolvedBy || null,
      payload: resolution.payload !== undefined ? clone(resolution.payload) : checkpoint.payload,
    }
  })

  if (!matched) return clone(run)

  const openCheckpoint = firstOpenCheckpoint({ ...run, checkpoints })
  const nextRun = {
    ...clone(run),
    checkpoints,
    currentCheckpointId: openCheckpoint ? openCheckpoint.id : null,
    currentStepId: openCheckpoint ? openCheckpoint.stepId || run.currentStepId || null : run.currentStepId || null,
    status: openCheckpoint ? 'waiting_user' : (allStepsCompleted({ ...run, checkpoints }) ? 'completed' : 'running'),
    updatedAt: resolvedAt,
  }

  return nextRun
}

export function attachArtifact(run, artifact = {}) {
  const nextArtifact = normalizeArtifact(artifact)
  return withRunUpdate(run, {
    artifacts: [...(run.artifacts || []), nextArtifact],
  })
}
