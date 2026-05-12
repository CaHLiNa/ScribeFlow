import assert from 'node:assert/strict'
import { buildExtensionTargetSummary } from '../src/domains/extensions/extensionTargetPresentation.js'

const pdfReferenceTarget = buildExtensionTargetSummary({
  kind: 'referencePdf',
  path: '/tmp/paper.pdf',
  referenceId: 'ref-123',
})

assert.equal(pdfReferenceTarget.available, true)
assert.equal(pdfReferenceTarget.kind, 'referencePdf')
assert.equal(pdfReferenceTarget.textKey, 'Target: {path} · ref:{referenceId}')
assert.deepEqual(pdfReferenceTarget.params, {
  path: '/tmp/paper.pdf',
  referenceId: 'ref-123',
})

const fileTarget = buildExtensionTargetSummary({
  kind: 'workspace',
  path: '/tmp/note.md',
})

assert.equal(fileTarget.available, true)
assert.equal(fileTarget.textKey, 'Target: {path}')
assert.deepEqual(fileTarget.params, {
  path: '/tmp/note.md',
})

const referenceOnlyTarget = buildExtensionTargetSummary({
  reference_id: 'ref-456',
})

assert.equal(referenceOnlyTarget.available, true)
assert.equal(referenceOnlyTarget.textKey, 'Target reference: {referenceId}')
assert.deepEqual(referenceOnlyTarget.params, {
  referenceId: 'ref-456',
})

const emptyTarget = buildExtensionTargetSummary({})

assert.equal(emptyTarget.available, false)
assert.equal(emptyTarget.textKey, '')
assert.deepEqual(emptyTarget.params, {})

console.log(JSON.stringify({
  ok: true,
  summary: {
    pdfReference: pdfReferenceTarget.textKey,
    file: fileTarget.textKey,
    referenceOnly: referenceOnlyTarget.textKey,
    emptyAvailable: emptyTarget.available,
  },
}, null, 2))
