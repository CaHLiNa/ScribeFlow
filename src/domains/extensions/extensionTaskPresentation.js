import { buildExtensionTaskResultEntries, titleCaseKey } from './extensionResultEntries.js'
import { buildExtensionProgressPresentation } from './extensionProgressPresentation.js'
import { buildExtensionTargetSummary } from './extensionTargetPresentation.js'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeState(value = '') {
  return normalizeText(value).toLowerCase()
}

export function canonicalTaskStatusKey(value = '') {
  switch (normalizeState(value)) {
    case 'queued':
      return 'Queued'
    case 'running':
      return 'Running'
    case 'succeeded':
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'cancelled':
    case 'canceled':
      return 'Cancelled'
    default:
      return ''
  }
}

export function taskStatusToneClass(value = '') {
  switch (normalizeState(value)) {
    case 'succeeded':
    case 'completed':
      return 'is-success'
    case 'failed':
      return 'is-error'
    case 'cancelled':
    case 'canceled':
      return 'is-warning'
    case 'queued':
    case 'running':
      return 'is-warning'
    default:
      return ''
  }
}

export function taskTitleKey(task = {}) {
  const explicit = normalizeText(task.commandId || task.command_id || task.capability)
  if (!explicit) return 'Extension task'
  if (explicit === 'retainPdf.refreshView') return 'RetainPDF'
  return titleCaseKey(explicit)
}

export function taskStatusPresentation(task = {}) {
  const raw = normalizeText(task?.progress?.label || task?.state)
  const fallback = normalizeText(task?.state)
  return {
    labelKey: canonicalTaskStatusKey(raw) || raw || canonicalTaskStatusKey(fallback) || fallback || 'Completed',
    toneClass: taskStatusToneClass(task?.state),
  }
}

export function taskTargetPresentation(task = {}) {
  return buildExtensionTargetSummary(task?.target || {})
}

export function taskProgressPresentation(task = {}) {
  const label = normalizeText(task?.progress?.label)
  const current = Number(task?.progress?.current || 0)
  const total = Number(task?.progress?.total || 0)
  const visual = buildExtensionProgressPresentation({
    ...(task?.progress || {}),
    state: task?.state || task?.progress?.state || '',
  })
  if (total > 0) {
    return {
      available: true,
      labelKey: canonicalTaskStatusKey(label) || label || 'Progress',
      params: { current, total },
      valueKey: '{label}',
      visual,
    }
  }

  const status = taskStatusPresentation(task)
  const labelKey = canonicalTaskStatusKey(label) || label
  return {
    available: Boolean(labelKey && labelKey !== status.labelKey),
    labelKey,
    params: {},
    valueKey: labelKey,
    visual,
  }
}

export function taskResultSummaryPresentation(task = {}) {
  const entries = buildExtensionTaskResultEntries(task)
  const artifactCount = Array.isArray(task?.artifacts) ? task.artifacts.length : 0
  const outputCount = Array.isArray(task?.outputs) ? task.outputs.length : 0
  const actionCount = entries.filter((entry) =>
    normalizeText(entry?.action).toLowerCase() === 'execute-command'
  ).length

  return {
    entries,
    entryCount: entries.length,
    artifactCount,
    outputCount,
    actionCount,
    hasPreviewableEntry: entries.some((entry) => normalizeText(entry?.previewMode)),
  }
}

export function taskFactsPresentation(task = {}) {
  const facts = []
  const target = taskTargetPresentation(task)
  if (target.available) {
    facts.push({
      id: 'target',
      labelKey: 'Target',
      valueKey: target.textKey,
      params: target.params,
    })
  } else if (target.kind) {
    facts.push({
      id: 'target-kind',
      labelKey: 'Target',
      valueKey: target.kind,
      params: {},
    })
  }

  const resultSummary = taskResultSummaryPresentation(task)
  if (resultSummary.entryCount > 0) {
    facts.push({
      id: 'results',
      labelKey: 'Results',
      valueKey: '{count} entries',
      params: { count: resultSummary.entryCount },
    })
  }
  if (resultSummary.artifactCount > 0) {
    facts.push({
      id: 'artifacts',
      labelKey: 'Artifacts',
      valueKey: '{count} artifacts',
      params: { count: resultSummary.artifactCount },
    })
  }

  return facts
}

export function buildExtensionTaskPresentation(task = {}) {
  const status = taskStatusPresentation(task)
  const progress = taskProgressPresentation(task)
  const results = taskResultSummaryPresentation(task)
  return {
    id: normalizeText(task?.id),
    titleKey: taskTitleKey(task),
    status,
    progress,
    results,
    facts: taskFactsPresentation(task),
  }
}
