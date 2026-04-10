import test from 'node:test'
import assert from 'node:assert/strict'

import { createDocumentWorkflowAdaptersRuntime } from '../src/domains/document/documentWorkflowAdaptersRuntime.js'

const runtime = createDocumentWorkflowAdaptersRuntime()

test('document workflow adapters runtime resolves workflow adapters for supported files', () => {
  assert.equal(runtime.resolveForFile('/workspace/paper.md')?.kind, 'markdown')
  assert.equal(runtime.resolveForFile('/workspace/paper.tex')?.kind, 'latex')
  assert.equal(runtime.resolveForFile('/workspace/paper.typ')?.kind, 'typst')
})

test('document workflow adapters runtime exposes capability summaries', () => {
  const markdownCapabilities = runtime.resolveCapabilities('/workspace/paper.md')
  assert.equal(markdownCapabilities.kind, 'markdown')
  assert.equal(markdownCapabilities.supportsPreview, true)
  assert.equal(markdownCapabilities.supportsCompile, false)
  assert.deepEqual(markdownCapabilities.supportedPreviewKinds, ['html'])

  const latexCapabilities = runtime.resolveCapabilities('/workspace/paper.tex', {
    workflowOnly: false,
  })
  assert.equal(latexCapabilities.kind, 'latex')
  assert.equal(latexCapabilities.supportsPreview, true)
  assert.equal(latexCapabilities.supportsCompile, true)
  assert.deepEqual(latexCapabilities.supportedPreviewKinds, ['pdf'])
})

test('document workflow adapters runtime returns empty capability state for unsupported files', () => {
  assert.deepEqual(runtime.resolveCapabilities('/workspace/data.csv'), {
    adapter: null,
    kind: null,
    supportsWorkflow: false,
    supportsPreview: false,
    supportsCompile: false,
    supportedPreviewKinds: [],
    defaultPreviewKind: null,
  })
})
