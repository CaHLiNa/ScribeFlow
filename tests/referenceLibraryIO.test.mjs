import test from 'node:test'
import assert from 'node:assert/strict'

import {
  REFERENCE_LIBRARY_FILENAME,
  buildDefaultReferenceLibrarySnapshot,
  normalizeReferenceLibrarySnapshot,
  resolveReferenceLibraryFile,
  resolveReferencesDataDir,
} from '../src/services/references/referenceLibraryIO.js'

test('reference library paths resolve inside the workspace data directory', () => {
  assert.equal(resolveReferencesDataDir('/tmp/workspace-data'), '/tmp/workspace-data/references')
  assert.equal(
    resolveReferenceLibraryFile('/tmp/workspace-data'),
    `/tmp/workspace-data/references/${REFERENCE_LIBRARY_FILENAME}`
  )
})

test('default reference library snapshot has the expected top-level fields', () => {
  const snapshot = buildDefaultReferenceLibrarySnapshot()

  assert.equal(snapshot.version, 1)
  assert.equal(Array.isArray(snapshot.collections), true)
  assert.equal(Array.isArray(snapshot.tags), true)
  assert.equal(Array.isArray(snapshot.references), true)
  assert.equal(snapshot.references.length, 0)
})

test('normalizing a saved library snapshot removes legacy demo references and backfills type keys', () => {
  const snapshot = normalizeReferenceLibrarySnapshot({
    references: [
      {
        id: 'ref-1',
        title: 'CBF-based safety design for adaptive control of uncertain nonlinear strict-feedback systems',
        typeLabel: '期刊论文',
      },
      {
        id: 'user-1',
        title: 'Real Paper',
        typeLabel: '会议论文',
      },
    ],
  })

  assert.equal(snapshot.references.length, 1)
  assert.equal(snapshot.references[0].id, 'user-1')
  assert.equal(snapshot.references[0].typeKey, 'conference-paper')
})
