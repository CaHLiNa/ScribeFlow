import test from 'node:test'
import assert from 'node:assert/strict'

import { createReferenceAssetRuntime } from '../src/domains/reference/referenceAssetRuntime.js'

function createHarness() {
  const state = {
    globalLibrary: [
      { _key: 'alpha', _pdfFile: 'alpha.pdf', _textFile: 'alpha.txt' },
      { _key: 'beta' },
    ],
    globalKeyMap: { alpha: 0, beta: 1 },
    globalConfigDir: '/config',
  }
  const removed = []
  const deletedAssets = []
  const writes = []
  const updates = []

  const runtime = createReferenceAssetRuntime({
    getGlobalLibrary: () => state.globalLibrary,
    getGlobalKeyMap: () => state.globalKeyMap,
    getGlobalConfigDir: () => state.globalConfigDir,
    applyGlobalRemoval: (keys) => {
      removed.push(keys)
      state.globalLibrary = state.globalLibrary.filter((ref) => !keys.includes(ref._key))
      state.globalKeyMap = Object.fromEntries(state.globalLibrary.map((ref, index) => [ref._key, index]))
      return keys
    },
    deleteReferenceAsset: async (path) => {
      deletedAssets.push(path)
    },
    writeLibraries: async () => {
      writes.push(true)
    },
    updateReference: (key, patch) => {
      updates.push({ key, patch })
    },
    resolveGlobalReferencePdfPath: (globalConfigDir, fileName) => `${globalConfigDir}/pdfs/${fileName}`,
    resolveGlobalReferenceFulltextPath: (globalConfigDir, fileName) => `${globalConfigDir}/fulltext/${fileName}`,
    resolveGlobalReferencePdfsDir: (globalConfigDir) => `${globalConfigDir}/pdfs`,
    resolveGlobalReferenceFulltextDir: (globalConfigDir) => `${globalConfigDir}/fulltext`,
    invoke: async (command, payload) => {
      writes.push({ command, payload })
    },
    extractTextFromPdf: async () => 'full text',
  })

  return {
    runtime,
    state,
    removed,
    deletedAssets,
    writes,
    updates,
  }
}

test('reference asset runtime removes global references, deletes assets, and persists libraries', async () => {
  const harness = createHarness()

  const removedKeys = await harness.runtime.removeReferencesFromGlobal(['alpha', 'alpha', 'missing'])

  assert.deepEqual(removedKeys, ['alpha'])
  assert.deepEqual(harness.removed, [['alpha']])
  assert.deepEqual(harness.deletedAssets, ['/config/pdfs/alpha.pdf', '/config/fulltext/alpha.txt'])
  assert.equal(harness.writes.includes(true), true)
})

test('reference asset runtime stores PDFs and extracted text before updating the reference', async () => {
  const harness = createHarness()

  await harness.runtime.storePdf('alpha', '/tmp/input.pdf')

  assert.deepEqual(harness.updates, [
    { key: 'alpha', patch: { _pdfFile: 'alpha.pdf' } },
    { key: 'alpha', patch: { _textFile: 'alpha.txt' } },
  ])
  assert.deepEqual(harness.writes.slice(0, 3), [
    { command: 'create_dir', payload: { path: '/config/pdfs' } },
    { command: 'copy_file', payload: { src: '/tmp/input.pdf', dest: '/config/pdfs/alpha.pdf' } },
    { command: 'create_dir', payload: { path: '/config/fulltext' } },
  ])
})

test('reference asset runtime no-ops when no global config directory exists', async () => {
  const harness = createHarness()
  harness.state.globalConfigDir = ''

  await harness.runtime.storePdf('alpha', '/tmp/input.pdf')

  assert.deepEqual(harness.updates, [])
  assert.deepEqual(harness.writes, [])
})
