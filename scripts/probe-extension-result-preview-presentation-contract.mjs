import assert from 'node:assert/strict'
import {
  actionKeyForResultEntry,
  buildExtensionResultPreviewPresentation,
  inferExtensionResultPreviewMode,
  labelKeyForResultAction,
} from '../src/domains/extensions/extensionResultPreviewPresentation.ts'

assert.equal(
  inferExtensionResultPreviewMode({
    mediaType: 'application/pdf',
    path: '/tmp/paper.bin',
  }),
  'pdf',
)
assert.equal(inferExtensionResultPreviewMode({ path: '/tmp/image.webp' }), 'image')
assert.equal(inferExtensionResultPreviewMode({ path: '/tmp/index.html' }), 'html')
assert.equal(inferExtensionResultPreviewMode({ path: '/tmp/output.log' }), 'text')
assert.equal(labelKeyForResultAction({ action: 'execute-command' }), 'Run')

const pdfEntry = {
  id: 'translated-pdf',
  label: 'Translated PDF',
  path: '/tmp/paper.zh.pdf',
  mediaType: 'application/pdf',
  action: 'open',
  reference_id: 'ref-123',
}

const pdfPresentation = buildExtensionResultPreviewPresentation(pdfEntry)

assert.equal(pdfPresentation.previewMode, 'pdf')
assert.equal(pdfPresentation.isPdfPreview, true)
assert.equal(pdfPresentation.previewPath, '/tmp/paper.zh.pdf')
assert.equal(pdfPresentation.previewTitleKey, 'Translated PDF')
assert.deepEqual(
  pdfPresentation.toolbarActions.map((action) => [action.id, action.labelKey, action.entry.action]),
  [
    ['primary', 'Open', 'open'],
    ['reveal', 'Reveal', 'reveal'],
    ['copy-path', 'Copy Path', 'copy-path'],
    ['open-reference', 'Open Reference', 'open-reference'],
  ],
)
assert.equal(pdfPresentation.emptyState, null)

const blockedPresentation = buildExtensionResultPreviewPresentation({
  id: 'rerun',
  action: 'execute-command',
  extensionId: 'example-pdf-extension',
  commandId: 'scribeflow.pdf.translate',
}, {
  hostDiagnostics: {
    blockedByForeignPrompt: true,
    pendingPromptOwner: {
      extensionId: 'another-extension',
    },
    blockingPromptWorkspaceRoot: '/tmp/workspace-b',
  },
})

assert.equal(blockedPresentation.toolbarActions.length, 1)
assert.equal(blockedPresentation.toolbarActions[0].labelKey, 'Run')
assert.equal(blockedPresentation.toolbarActions[0].blocked, true)
assert.equal(blockedPresentation.toolbarActions[0].blockedLabelKey, 'Blocked')
assert.equal(
  blockedPresentation.toolbarActions[0].blockedMessageKey,
  'The shared extension host is currently blocked by {extensionId} in {workspace}. Resolve that prompt first.',
)
assert.equal(blockedPresentation.emptyState.kind, 'actionable')

const unavailablePresentation = buildExtensionResultPreviewPresentation({
  id: 'metadata-only',
  label: 'Metadata',
})

assert.equal(unavailablePresentation.toolbarActions.length, 0)
assert.equal(unavailablePresentation.emptyState.kind, 'unavailable')
assert.equal(unavailablePresentation.emptyState.titleKey, 'Preview unavailable for this result entry.')

assert.equal(
  actionKeyForResultEntry({
    id: 'translated-pdf',
    action: 'open-reference',
    targetPath: '/tmp/paper.zh.pdf',
    referenceId: 'ref-123',
  }),
  'translated-pdf::open-reference::/tmp/paper.zh.pdf::ref-123',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    pdfToolbarActionIds: pdfPresentation.toolbarActions.map((action) => action.id),
    blockedActionLabel: blockedPresentation.toolbarActions[0].labelKey,
    unavailableEmptyState: unavailablePresentation.emptyState.kind,
  },
}, null, 2))
