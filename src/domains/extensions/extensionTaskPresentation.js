import { buildExtensionTaskResultEntries, titleCaseKey } from './extensionResultEntries.js'
import { buildExtensionProgressPresentation } from './extensionProgressPresentation.js'
import { buildExtensionTargetSummary } from './extensionTargetPresentation.js'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeState(value = '') {
  return normalizeText(value).toLowerCase()
}

const ACTIVE_TASK_STATES = new Set(['queued', 'running'])
const TERMINAL_TASK_STATES = new Set(['succeeded', 'completed', 'failed', 'cancelled', 'canceled'])

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

export function taskRowPresentation(task = {}) {
  const state = normalizeState(task?.state)
  return {
    state,
    toneClass: taskStatusToneClass(state),
    active: ACTIVE_TASK_STATES.has(state),
    terminal: TERMINAL_TASK_STATES.has(state),
  }
}

export function taskGroupPresentation({ id = '', titleKey = '', tasks = [] } = {}) {
  const taskList = Array.isArray(tasks) ? tasks : []
  const rowStates = taskList.map(taskRowPresentation)
  const errorCount = rowStates.filter((row) => row.toneClass === 'is-error').length
  const activeCount = rowStates.filter((row) => row.active).length
  const warningCount = rowStates.filter((row) => row.toneClass === 'is-warning').length
  const count = taskList.length
  return {
    id: normalizeText(id),
    titleKey: normalizeText(titleKey) || 'Extension Tasks',
    count,
    countLabelKey: count === 1 ? '{count} task' : '{count} tasks',
    countParams: { count },
    toneClass: errorCount > 0 ? 'is-error' : activeCount > 0 || warningCount > 0 ? 'is-warning' : '',
  }
}

export function taskTimelinePresentation(timeline = {}) {
  const hiddenRecentCount = Math.max(0, Number(timeline?.recentHiddenCount || 0))
  const recentTotalCount = Math.max(0, Number(timeline?.recentTotalCount || 0))
  const recentVisibleCount = Math.max(0, Number(timeline?.recentVisibleCount || 0))
  const expanded = hiddenRecentCount === 0 && recentTotalCount > Number(timeline?.recentCompactLimit || 0)
  return {
    recent: {
      hasHidden: hiddenRecentCount > 0,
      expanded,
      canToggle: hiddenRecentCount > 0 || expanded,
      hiddenCount: hiddenRecentCount,
      visibleCount: recentVisibleCount,
      totalCount: recentTotalCount,
      hiddenLabelKey: hiddenRecentCount === 1 ? '{count} older task hidden' : '{count} older tasks hidden',
      hiddenParams: { count: hiddenRecentCount },
      expandedLabelKey: recentTotalCount === 1 ? 'Showing {count} recent task' : 'Showing {count} recent tasks',
      expandedParams: { count: recentTotalCount },
      showAllLabelKey: 'Show Older Tasks',
      collapseLabelKey: 'Collapse History',
    },
  }
}

export function taskDetailPresentation(task = {}, results = taskResultSummaryPresentation(task), progress = taskProgressPresentation(task)) {
  const row = taskRowPresentation(task)
  const state = row.state
  const hasResults = Number(results?.entryCount || 0) > 0
  const hasProgress = Boolean(progress?.available)
  const available = hasResults || hasProgress
  const terminalNeedsAttention = state === 'failed' || state === 'cancelled' || state === 'canceled'
  return {
    available,
    collapsible: available && !row.active,
    defaultExpanded: available && (row.active || terminalNeedsAttention || !row.terminal),
    expandLabelKey: 'Show Details',
    collapseLabelKey: 'Hide Details',
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
  const previewEntries = entries.filter((entry) => normalizeText(entry?.previewMode || entry?.preview_mode))
  const actionEntries = entries.filter((entry) => !normalizeText(entry?.previewMode || entry?.preview_mode))
  const artifactCount = Array.isArray(task?.artifacts) ? task.artifacts.length : 0
  const outputCount = Array.isArray(task?.outputs) ? task.outputs.length : 0
  const actionCount = entries.filter((entry) =>
    normalizeText(entry?.action).toLowerCase() === 'execute-command'
  ).length
  const groups = [
    {
      id: 'previews',
      titleKey: 'Previews',
      entries: previewEntries,
      count: previewEntries.length,
    },
    {
      id: 'actions',
      titleKey: 'Actions',
      entries: actionEntries,
      count: actionEntries.length,
    },
  ].filter((group) => group.entries.length > 0)

  return {
    entries,
    groups,
    entryCount: entries.length,
    artifactCount,
    outputCount,
    actionCount,
    previewCount: previewEntries.length,
    actionEntryCount: actionEntries.length,
    hasPreviewableEntry: previewEntries.length > 0,
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

export function taskQuickActionsPresentation(task = {}, results = taskResultSummaryPresentation(task)) {
  const state = normalizeState(task?.state)
  if (state === 'running' || state === 'queued') {
    return [
      {
        id: 'cancel',
        labelKey: 'Cancel',
        kind: 'cancel',
        variant: 'secondary',
      },
    ]
  }

  if (state !== 'failed' && state !== 'cancelled' && state !== 'canceled') {
    return []
  }

  const actions = []
  const entries = Array.isArray(results?.entries) ? results.entries : []
  const logEntry = entries.find((entry) =>
    normalizeText(entry?.previewMode || entry?.preview_mode) &&
    [
      entry?.id,
      entry?.label,
      entry?.previewTitle,
      entry?.preview_title,
    ].some((value) => normalizeText(value).toLowerCase().includes('log'))
  )
  if (logEntry) {
    actions.push({
      id: 'open-log',
      labelKey: 'Task Log',
      kind: 'select-entry',
      variant: 'secondary',
      entryId: normalizeText(logEntry.id),
    })
  }

  const rerunEntry = entries.find((entry) =>
    normalizeText(entry?.action).toLowerCase() === 'execute-command'
  )
  if (rerunEntry) {
    actions.push({
      id: 'rerun',
      labelKey: 'Run Again',
      kind: 'run-entry',
      variant: 'primary',
      entryId: normalizeText(rerunEntry.id),
    })
  }

  return actions
}

export function buildExtensionTaskPresentation(task = {}) {
  const status = taskStatusPresentation(task)
  const progress = taskProgressPresentation(task)
  const results = taskResultSummaryPresentation(task)
  const quickActions = taskQuickActionsPresentation(task, results)
  const details = taskDetailPresentation(task, results, progress)
  return {
    id: normalizeText(task?.id),
    titleKey: taskTitleKey(task),
    row: taskRowPresentation(task),
    status,
    progress,
    results,
    quickActions,
    details,
    facts: taskFactsPresentation(task),
  }
}
