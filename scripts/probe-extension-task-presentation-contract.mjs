import assert from 'node:assert/strict'
import { buildExtensionTaskPresentation } from '../src/domains/extensions/extensionTaskPresentation.js'

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
assert.equal(presentation.results.hasPreviewableEntry, true)
assert.deepEqual(
  presentation.results.entries.map((entry) => entry.id),
  ['translated-pdf', 'summary', 'task-1:log', 'task-1:rerun'],
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
assert.equal(running.progress.available, false)

console.log(JSON.stringify({
  ok: true,
  summary: {
    titleKey: presentation.titleKey,
    factIds: presentation.facts.map((fact) => fact.id),
    resultEntryIds: presentation.results.entries.map((entry) => entry.id),
    progressWidth: presentation.progress.visual.width,
    runningTone: running.status.toneClass,
  },
}, null, 2))
