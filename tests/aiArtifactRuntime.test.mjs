import test from 'node:test'
import assert from 'node:assert/strict'

import { applyTextPatchToContent } from '../src/domains/ai/aiArtifactRuntime.js'

test('applyTextPatchToContent replaces the selected range only when the source text matches', () => {
  const result = applyTextPatchToContent('012old789', {
    from: 3,
    to: 6,
    originalText: 'old',
    replacementText: 'new',
  })

  assert.equal(result, '012new789')
})
