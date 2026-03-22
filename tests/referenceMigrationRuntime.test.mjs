import test from 'node:test'
import assert from 'node:assert/strict'

import { createReferenceMigrationRuntime } from '../src/domains/reference/referenceMigrationRuntime.js'

function createHarness() {
  const copied = []
  const deleted = []

  const runtime = createReferenceMigrationRuntime({
    captureWorkspaceContext: () => ({
      projectDir: '/workspace/project',
      globalConfigDir: '/config',
    }),
    readJsonArray: async () => [
      { _key: 'legacy-a', title: 'Legacy A', _pdfFile: 'legacy-a.pdf', _textFile: 'legacy-a.txt' },
      { title: 'Needs key' },
    ],
    resolveLegacyWorkspaceReferenceLibraryPath: (projectDir) => `${projectDir}/legacy/references.json`,
    resolveLegacyWorkspaceReferencePdfsDir: (projectDir) => `${projectDir}/legacy/pdfs`,
    resolveLegacyWorkspaceReferenceFulltextDir: (projectDir) => `${projectDir}/legacy/fulltext`,
    resolveGlobalReferencePdfPath: (globalConfigDir, filename) => `${globalConfigDir}/pdfs/${filename}`,
    resolveGlobalReferenceFulltextPath: (globalConfigDir, filename) => `${globalConfigDir}/fulltext/${filename}`,
    buildReferenceKey: () => 'generated-key',
    referenceKey: (ref) => ref?._key || ref?.id || null,
    cloneReferenceValue: (value) => JSON.parse(JSON.stringify(value)),
    buildKeyMapFromList: (list) => Object.fromEntries(list.map((ref, index) => [ref._key, index])),
    copyFileIfPresent: async (source, target) => {
      copied.push({ source, target })
      return true
    },
    pathExists: async (path) => path === '/tmp/existing.pdf',
    deletePath: async (path) => {
      deleted.push(path)
    },
  })

  return {
    runtime,
    copied,
    deleted,
  }
}

test('reference migration runtime migrates legacy library entries and assets', async () => {
  const harness = createHarness()

  const result = await harness.runtime.migrateLegacyWorkspaceData(
    { projectDir: '/workspace/project', globalConfigDir: '/config' },
    { globalLibrary: [], workspaceKeys: [] },
  )

  assert.equal(result.legacyLibraryFound, true)
  assert.equal(result.didChange, true)
  assert.deepEqual(result.workspaceKeys, ['legacy-a', 'generated-key'])
  assert.equal(result.globalLibrary[0]._pdfFile, 'legacy-a.pdf')
  assert.equal(result.globalLibrary[0]._textFile, 'legacy-a.txt')
  assert.equal(result.globalLibrary[1]._key, 'generated-key')
  assert.equal(harness.copied.length, 0)
})

test('reference migration runtime copies missing legacy assets onto the target ref', async () => {
  const harness = createHarness()
  const targetRef = {}

  const changed = await harness.runtime.migrateLegacyReferenceAssets(
    { projectDir: '/workspace/project', globalConfigDir: '/config' },
    targetRef,
    { _pdfFile: 'legacy-a.pdf', _textFile: 'legacy-a.txt' },
    'legacy-a',
  )

  assert.equal(changed, true)
  assert.equal(targetRef._pdfFile, 'legacy-a.pdf')
  assert.equal(targetRef._textFile, 'legacy-a.txt')
})

test('reference migration runtime deletes assets only when the path exists', async () => {
  const harness = createHarness()

  assert.equal(await harness.runtime.deleteReferenceAsset('/tmp/existing.pdf'), true)
  assert.equal(await harness.runtime.deleteReferenceAsset('/tmp/missing.pdf'), false)
  assert.deepEqual(harness.deleted, ['/tmp/existing.pdf'])
})
