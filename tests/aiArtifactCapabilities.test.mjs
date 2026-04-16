import test from 'node:test'
import assert from 'node:assert/strict'

import {
  canApplyAiArtifact,
  getAiArtifactCapability,
} from '../src/services/ai/artifactCapabilities.js'

test('getAiArtifactCapability maps known artifact types to tool capabilities', () => {
  const patchCapability = getAiArtifactCapability({ type: 'doc_patch' })
  const noteCapability = getAiArtifactCapability({ type: 'note_draft' })

  assert.equal(patchCapability.toolId, 'apply-document-patch')
  assert.equal(noteCapability.toolId, 'open-note-draft')
})

test('canApplyAiArtifact respects enabled tool ids', () => {
  assert.equal(
    canApplyAiArtifact({ type: 'doc_patch' }, ['apply-document-patch']),
    true
  )
  assert.equal(
    canApplyAiArtifact({ type: 'doc_patch' }, ['open-note-draft']),
    false
  )
})
