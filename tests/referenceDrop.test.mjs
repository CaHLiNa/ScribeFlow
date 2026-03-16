import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReferenceDropText } from '../src/editor/referenceDrop.js'

test('buildReferenceDropText uses markdown citation syntax for markdown files', () => {
  assert.equal(buildReferenceDropText('/tmp/paper.md', 'an2026'), '[@an2026]')
  assert.equal(buildReferenceDropText('/tmp/paper.qmd', ['an2026', 'liu2024']), '[@an2026; @liu2024]')
})

test('buildReferenceDropText uses latex citation syntax for latex files', () => {
  assert.equal(buildReferenceDropText('/tmp/paper.tex', 'an2026'), '\\cite{an2026}')
  assert.equal(buildReferenceDropText('/tmp/paper.latex', ['an2026', 'liu2024']), '\\cite{an2026, liu2024}')
})

test('buildReferenceDropText uses typst citation syntax for typst files', () => {
  assert.equal(buildReferenceDropText('/tmp/paper.typ', 'an2026'), '@an2026')
  assert.equal(buildReferenceDropText('/tmp/paper.typ', ['an2026', 'liu2024']), '@an2026 @liu2024')
})

test('buildReferenceDropText rejects unsupported files and empty keys', () => {
  assert.equal(buildReferenceDropText('/tmp/app.js', 'an2026'), '')
  assert.equal(buildReferenceDropText('/tmp/paper.md', []), '')
})
