import test from 'node:test'
import assert from 'node:assert/strict'

import { createDocumentCitationRuntime } from '../src/domains/document/documentCitationRuntime.js'

const runtime = createDocumentCitationRuntime()

test('document citation runtime reports insertion support for supported document types', () => {
  assert.equal(runtime.supportsInsertion('/tmp/paper.md'), true)
  assert.equal(runtime.supportsInsertion('/tmp/paper.tex'), true)
  assert.equal(runtime.supportsInsertion('/tmp/paper.typ'), true)
  assert.equal(runtime.supportsInsertion('/tmp/script.js'), false)
})

test('document citation runtime builds syntax-aware citation text for each supported document type', () => {
  assert.equal(runtime.buildCitationText('/tmp/paper.md', ['an2026', 'liu2024']), '[@an2026; @liu2024]')
  assert.equal(runtime.buildCitationText('/tmp/paper.tex', ['an2026', 'liu2024']), '\\cite{an2026, liu2024}')
  assert.equal(runtime.buildCitationText('/tmp/paper.typ', ['an2026', 'liu2024']), '@an2026 @liu2024')
})

test('document citation runtime honors latex citation command overrides', () => {
  assert.equal(
    runtime.buildCitationText('/tmp/paper.tex', ['an2026'], { latexCommand: 'citep' }),
    '\\citep{an2026}',
  )
})
