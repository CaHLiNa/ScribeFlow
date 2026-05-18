import assert from 'node:assert/strict'
import {
  buildExtensionTaskPresentation,
  taskGroupPresentation,
  taskTimelinePresentation,
} from '../src/domains/extensions/extensionTaskPresentation.js'

const task = {
  id: 'task-1',
  extensionId: 'example-pdf-extension',
  commandId: 'scribeflow.pdf.translate',
  state: 'succeeded',
  target: {
    kind: 'pdf',
    path: '/tmp/paper.pdf',
    reference_id: 'ref-123',
  },
  progress: {
    label: 'Completed',
    current: 2,
    total: 2,
  },
  artifacts: [
    {
      id: 'translated-pdf',
      kind: 'translated-pdf',
      mediaType: 'application/pdf',
      path: '/tmp/paper.zh.pdf',
    },
  ],
  outputs: [
    {
      id: 'summary',
      type: 'inlineText',
      title: 'Summary',
      text: 'done',
    },
  ],
  logPath: '/tmp/task.log',
}

const presentation = buildExtensionTaskPresentation(task)

assert.equal(presentation.id, 'task-1')
assert.equal(presentation.titleKey, 'Scribeflow Pdf Translate')
assert.equal(presentation.status.labelKey, 'Completed')
assert.equal(presentation.status.toneClass, 'is-success')
assert.deepEqual(presentation.row, {
  state: 'succeeded',
  toneClass: 'is-success',
  active: false,
  terminal: true,
})
assert.deepEqual(presentation.details, {
  available: true,
  collapsible: true,
  defaultExpanded: false,
  expandLabelKey: 'Show Details',
  collapseLabelKey: 'Hide Details',
})
assert.equal(presentation.progress.available, true)
assert.equal(presentation.progress.valueKey, '{label}')
assert.deepEqual(presentation.progress.params, { current: 2, total: 2 })
assert.equal(presentation.progress.visual.width, '100%')
assert.equal(presentation.progress.visual.toneClass, 'is-success')
assert.deepEqual(
  presentation.facts.map((fact) => [fact.id, fact.labelKey, fact.valueKey]),
  [
    ['target', 'Target', 'Target: {path} · ref:{referenceId}'],
    ['results', 'Results', '{count} entries'],
    ['artifacts', 'Artifacts', '{count} artifacts'],
  ],
)
assert.equal(presentation.results.entryCount, 4)
assert.equal(presentation.results.artifactCount, 1)
assert.equal(presentation.results.outputCount, 1)
assert.equal(presentation.results.actionCount, 1)
assert.equal(presentation.results.previewCount, 3)
assert.equal(presentation.results.actionEntryCount, 1)
assert.equal(presentation.results.hasPreviewableEntry, true)
assert.deepEqual(
  presentation.results.entries.map((entry) => entry.id),
  ['translated-pdf', 'summary', 'task-1:log', 'task-1:rerun'],
)
assert.deepEqual(
  presentation.results.groups.map((group) => [group.id, group.titleKey, group.entries.map((entry) => entry.id)]),
  [
    ['previews', 'Previews', ['translated-pdf', 'summary', 'task-1:log']],
    ['actions', 'Actions', ['task-1:rerun']],
  ],
)

const running = buildExtensionTaskPresentation({
  id: 'task-running',
  capability: 'document.summarize',
  state: 'running',
  progress: { label: 'Analyzing' },
})

assert.equal(running.titleKey, 'Document Summarize')
assert.equal(running.status.labelKey, 'Analyzing')
assert.equal(running.status.toneClass, 'is-warning')
assert.equal(running.row.active, true)
assert.equal(running.details.available, false)
assert.equal(running.details.collapsible, false)
assert.equal(running.details.defaultExpanded, false)
assert.equal(running.progress.available, false)

const failed = buildExtensionTaskPresentation({
  id: 'task-failed',
  extensionId: 'example-pdf-extension',
  commandId: 'scribeflow.pdf.translate',
  state: 'failed',
  target: {
    kind: 'pdf',
    path: '/tmp/paper.pdf',
  },
  outputs: [
    {
      id: 'failure-summary',
      type: 'inlineText',
      title: 'Failure Summary',
      text: 'worker stderr',
    },
  ],
  logPath: '/tmp/extension-task.log',
})

assert.equal(failed.status.labelKey, 'Failed')
assert.equal(failed.status.toneClass, 'is-error')
assert.equal(failed.row.toneClass, 'is-error')
assert.equal(failed.details.collapsible, true)
assert.equal(failed.details.defaultExpanded, true)
assert.deepEqual(
  failed.results.groups.map((group) => [group.id, group.entries.map((entry) => entry.id)]),
  [
    ['previews', ['failure-summary', 'task-failed:log']],
    ['actions', ['task-failed:rerun']],
  ],
)
assert.deepEqual(
  failed.quickActions.map((action) => [action.id, action.labelKey, action.kind, action.variant, action.entryId]),
  [
    ['open-log', 'Task Log', 'select-entry', 'secondary', 'task-failed:log'],
    ['rerun', 'Run Again', 'run-entry', 'primary', 'task-failed:rerun'],
  ],
)
assert.deepEqual(
  running.quickActions.map((action) => [action.id, action.labelKey, action.kind, action.variant]),
  [
    ['cancel', 'Cancel', 'cancel', 'secondary'],
  ],
)

const runningGroup = taskGroupPresentation({
  id: 'running',
  titleKey: 'Running',
  tasks: [
    { state: 'running' },
  ],
})
assert.equal(runningGroup.count, 1)
assert.equal(runningGroup.countLabelKey, '{count} task')
assert.equal(runningGroup.toneClass, 'is-warning')

const recentGroup = taskGroupPresentation({
  id: 'recent',
  titleKey: 'Recent Extension Tasks',
  tasks: [
    { state: 'succeeded' },
    { state: 'failed' },
  ],
})
assert.equal(recentGroup.count, 2)
assert.equal(recentGroup.countLabelKey, '{count} tasks')
assert.equal(recentGroup.toneClass, 'is-error')

const timelinePresentation = taskTimelinePresentation({
  recentHiddenCount: 3,
})
assert.equal(timelinePresentation.recent.hasHidden, true)
assert.equal(timelinePresentation.recent.hiddenCount, 3)
assert.equal(timelinePresentation.recent.hiddenLabelKey, '{count} older tasks hidden')
assert.deepEqual(timelinePresentation.recent.hiddenParams, { count: 3 })

const singleHiddenTimelinePresentation = taskTimelinePresentation({
  recentHiddenCount: 1,
})
assert.equal(singleHiddenTimelinePresentation.recent.hiddenLabelKey, '{count} older task hidden')

console.log(JSON.stringify({
  ok: true,
  summary: {
    titleKey: presentation.titleKey,
    factIds: presentation.facts.map((fact) => fact.id),
    resultEntryIds: presentation.results.entries.map((entry) => entry.id),
    resultGroups: presentation.results.groups.map((group) => `${group.id}:${group.count}`),
    progressWidth: presentation.progress.visual.width,
    runningTone: running.status.toneClass,
    completedDetailsDefaultExpanded: presentation.details.defaultExpanded,
    failedDetailsDefaultExpanded: failed.details.defaultExpanded,
    failedGroups: failed.results.groups.map((group) => `${group.id}:${group.count}`),
    failedQuickActions: failed.quickActions.map((action) => action.id),
    runningGroup: `${runningGroup.toneClass}:${runningGroup.countLabelKey}`,
    recentGroup: `${recentGroup.toneClass}:${recentGroup.countLabelKey}`,
    timelineFooter: timelinePresentation.recent.hiddenLabelKey,
  },
}, null, 2))
