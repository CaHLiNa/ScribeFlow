import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyTextPatchToContent,
  extractJsonPayload,
  normalizeAiArtifact,
} from '../src/domains/ai/aiArtifactRuntime.js'

test('extractJsonPayload can recover JSON from fenced model output', () => {
  const payload = extractJsonPayload('```json\n{"answer":"ok"}\n```')
  assert.deepEqual(payload, { answer: 'ok' })
})

test('normalizeAiArtifact creates a document patch artifact for revise-with-citations', () => {
  const artifact = normalizeAiArtifact(
    'revise-with-citations',
    {
      replacement_text: 'Revised paragraph.',
      rationale: 'Grounded in the selected source.',
    },
    {
      document: { available: true, filePath: '/workspace/paper.md' },
      selection: { available: true, from: 2, to: 5, text: 'old' },
      reference: { available: true },
    }
  )

  assert.equal(artifact.type, 'doc_patch')
  assert.equal(artifact.filePath, '/workspace/paper.md')
  assert.equal(artifact.replacementText, 'Revised paragraph.')
})

test('applyTextPatchToContent replaces the selected range only when the source text matches', () => {
  const result = applyTextPatchToContent('012old789', {
    from: 3,
    to: 6,
    originalText: 'old',
    replacementText: 'new',
  })

  assert.equal(result, '012new789')
})
