function trim(value = '') {
  return String(value || '').trim()
}

export function normalizeResearchTask(task = null) {
  if (!task || typeof task !== 'object') return null
  const id = trim(task.id)
  const title = trim(task.title)
  if (!id && !title) return null

  return {
    id,
    kind: trim(task.kind),
    title,
    goal: trim(task.goal),
    status: trim(task.status || 'active') || 'active',
    phase: trim(task.phase || 'scoping') || 'scoping',
    verificationSummary: trim(task.verificationSummary),
    blockedReason: trim(task.blockedReason),
    resumeHint: trim(task.resumeHint),
    runtimeThreadId: trim(task.runtimeThreadId),
  }
}

function humanizeTaskPhase(phase = '') {
  switch (trim(phase).toLowerCase()) {
    case 'gathering':
      return 'Gathering'
    case 'evidence':
      return 'Evidence'
    case 'writing':
      return 'Writing'
    case 'verification':
      return 'Verification'
    case 'completed':
      return 'Completed'
    case 'blocked':
      return 'Blocked'
    default:
      return 'Scoping'
  }
}

function humanizeTaskStatus(status = '') {
  switch (trim(status).toLowerCase()) {
    case 'completed':
      return 'Completed'
    case 'blocked':
      return 'Blocked'
    case 'failed':
      return 'Failed'
    default:
      return 'Active'
  }
}

export function resolveSessionTaskTitle(session = null, fallbackTitle = 'Session') {
  const task = normalizeResearchTask(session?.researchTask)
  return task?.title || trim(session?.title) || trim(fallbackTitle) || 'Session'
}

export function resolveSessionTaskSubtitle(session = null) {
  const task = normalizeResearchTask(session?.researchTask)
  if (!task) return ''
  if (task.status === 'blocked' && task.blockedReason) {
    return `Blocked · ${task.blockedReason}`
  }

  const parts = [humanizeTaskPhase(task.phase), humanizeTaskStatus(task.status)].filter(Boolean)
  return parts.join(' · ')
}
