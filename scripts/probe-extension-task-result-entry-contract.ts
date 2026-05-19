import assert from 'node:assert/strict'

const { buildExtensionTaskResultEntries } = await import('../src/domains/extensions/extensionResultEntries.ts')

const task = {
  id: 'task-result-entry',
  extensionId: 'retain-pdf',
  commandId: 'retainPdf.translateCurrent',
  target: {
    kind: 'pdf',
    referenceId: 'ref-123',
    path: '/tmp/source.pdf',
  },
  settings: {},
  resultEntries: [
    {
      id: 'retain-pdf-rerun',
      label: 'Run RetainPDF Again',
      action: 'execute-command',
      commandId: 'retainPdf.translateCurrent',
      extensionId: 'retain-pdf',
      targetKind: 'pdf',
      targetPath: '/tmp/source.pdf',
      referenceId: 'ref-123',
    },
    {
      id: 'retain-pdf-log',
      label: 'Open RetainPDF Log',
      action: 'open',
      path: '/tmp/retain-pdf.log',
      previewMode: 'text',
      previewTitle: 'RetainPDF Log',
      mediaType: 'text/plain',
    },
  ],
  artifacts: [
    {
      id: 'retain-pdf-log',
      kind: 'log',
      mediaType: 'text/plain',
      path: '/tmp/retain-pdf.log',
    },
    {
      id: 'retain-pdf-translated-pdf',
      kind: 'translated-pdf',
      mediaType: 'application/pdf',
      path: '/tmp/translated.pdf',
    },
  ],
  outputs: [
    {
      id: 'retain-pdf-summary',
      type: 'inlineText',
      mediaType: 'text/plain',
      title: 'RetainPDF Summary',
      text: 'Status: succeeded',
    },
  ],
  logPath: '/tmp/task.log',
}

const entries = buildExtensionTaskResultEntries(task)
const byId = new Map(entries.map((entry) => [entry.id, entry]))

assert.equal(byId.get('retain-pdf-rerun')?.label, 'Run RetainPDF Again')
assert.equal(byId.get('retain-pdf-log')?.label, 'Open RetainPDF Log')
assert.equal(byId.get('retain-pdf-log')?.previewTitle, 'RetainPDF Log')
assert.equal(byId.get('retain-pdf-translated-pdf')?.previewMode, 'pdf')
assert.equal(byId.get('retain-pdf-summary')?.previewTitle, 'RetainPDF Summary')
assert.equal(entries.filter((entry) => entry.id === 'retain-pdf-log').length, 1)
assert.ok(!entries.some((entry) => entry.id === 'task-result-entry:log'))
assert.ok(!entries.some((entry) => entry.id === 'task-result-entry:rerun'))

console.log(JSON.stringify({
  ok: true,
  resultEntryIds: entries.map((entry) => entry.id),
  explicitRerunLabel: byId.get('retain-pdf-rerun')?.label,
  mergedLogLabel: byId.get('retain-pdf-log')?.label,
}, null, 2))
