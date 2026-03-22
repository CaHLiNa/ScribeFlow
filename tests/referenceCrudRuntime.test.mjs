import test from 'node:test'
import assert from 'node:assert/strict'

import { createReferenceCrudRuntime } from '../src/domains/reference/referenceCrudRuntime.js'

function createHarness() {
  const state = {
    globalLibrary: [
      { _key: 'alpha', id: 'alpha', title: 'Alpha' },
    ],
    globalKeyMap: { alpha: 0 },
    workspaceKeys: ['alpha'],
  }
  const syncCalls = []
  const saveCalls = []
  const addKeyCalls = []
  const trackedImports = []

  const getByKey = (key) => {
    const idx = state.globalKeyMap[key]
    return idx === undefined ? null : state.globalLibrary[idx]
  }

  const runtime = createReferenceCrudRuntime({
    getGlobalLibrary: () => state.globalLibrary,
    getGlobalKeyMap: () => state.globalKeyMap,
    getWorkspaceKeys: () => state.workspaceKeys,
    setWorkspaceKeys: (value) => {
      state.workspaceKeys = value
    },
    getByKey,
    syncWorkspaceView: () => {
      state.globalKeyMap = Object.fromEntries(state.globalLibrary.map((ref, index) => [ref._key, index]))
      syncCalls.push(true)
    },
    saveLibrary: () => {
      saveCalls.push(true)
    },
    generateKey: () => 'generated-key',
    auditImportCandidate: (ref) => (
      ref.title === 'Duplicate'
        ? { existingKey: 'alpha', matchType: 'title' }
        : { existingKey: null, matchType: null }
    ),
    addKeyToWorkspace: (key) => {
      addKeyCalls.push(key)
      if (!state.workspaceKeys.includes(key)) {
        state.workspaceKeys = [...state.workspaceKeys, key]
      }
    },
    prepareReferenceImport: (cslJson, { generateKey }) => ({
      ...cslJson,
      _key: cslJson._key || generateKey(cslJson),
      id: cslJson._key || generateKey(cslJson),
    }),
    buildMergedReference: (existingRef, importedRef, fieldSelections) => (
      fieldSelections.skip ? null : { ...existingRef, ...importedRef }
    ),
    trackReferenceImport: (method) => {
      trackedImports.push(method)
    },
    now: () => '2026-03-22T00:00:00.000Z',
  })

  return {
    runtime,
    state,
    syncCalls,
    saveCalls,
    addKeyCalls,
    trackedImports,
  }
}

test('reference CRUD runtime adds new references and tracks imports', () => {
  const harness = createHarness()

  const result = harness.runtime.addReference({ title: 'New Ref', _importMethod: 'pdf' })

  assert.deepEqual(result, { key: 'generated-key', status: 'added' })
  assert.equal(harness.state.globalLibrary.length, 2)
  assert.equal(harness.state.globalLibrary[1]._addedAt, '2026-03-22T00:00:00.000Z')
  assert.deepEqual(harness.state.workspaceKeys, ['alpha', 'generated-key'])
  assert.equal(harness.syncCalls.length, 1)
  assert.equal(harness.saveCalls.length, 1)
  assert.deepEqual(harness.trackedImports, ['pdf'])
})

test('reference CRUD runtime routes duplicates back into the workspace', () => {
  const harness = createHarness()

  const result = harness.runtime.addReference({ title: 'Duplicate' })

  assert.equal(result.status, 'duplicate')
  assert.equal(result.existingKey, 'alpha')
  assert.deepEqual(harness.addKeyCalls, ['alpha'])
  assert.equal(harness.state.globalLibrary.length, 1)
})

test('reference CRUD runtime batches imports and reports preparation errors', () => {
  const harness = createHarness()

  const runtime = createReferenceCrudRuntime({
    getGlobalLibrary: () => harness.state.globalLibrary,
    getGlobalKeyMap: () => harness.state.globalKeyMap,
    getWorkspaceKeys: () => harness.state.workspaceKeys,
    setWorkspaceKeys: (value) => {
      harness.state.workspaceKeys = value
    },
    getByKey: (key) => {
      const idx = harness.state.globalKeyMap[key]
      return idx === undefined ? null : harness.state.globalLibrary[idx]
    },
    syncWorkspaceView: () => {
      harness.state.globalKeyMap = Object.fromEntries(harness.state.globalLibrary.map((ref, index) => [ref._key, index]))
    },
    saveLibrary: () => {},
    generateKey: () => 'batch-key',
    auditImportCandidate: () => ({ existingKey: null, matchType: null }),
    addKeyToWorkspace: () => {},
    prepareReferenceImport: (cslJson, { generateKey }) => {
      if (cslJson.title === 'Boom') throw new Error('bad import')
      return { ...cslJson, _key: generateKey(cslJson), id: generateKey(cslJson) }
    },
    buildMergedReference: (existingRef, importedRef) => ({ ...existingRef, ...importedRef }),
    trackReferenceImport: () => {},
    now: () => '2026-03-22T00:00:00.000Z',
  })

  const report = runtime.addReferences([{ title: 'Ok' }, { title: 'Boom' }])

  assert.deepEqual(report.added, ['batch-key'])
  assert.equal(report.errors.length, 1)
  assert.equal(report.errors[0].error, 'bad import')
})

test('reference CRUD runtime updates and merges existing references', () => {
  const harness = createHarness()

  assert.equal(harness.runtime.updateReference('alpha', { _key: 'alpha-updated', title: 'Renamed' }), true)
  assert.deepEqual(harness.state.workspaceKeys, ['alpha-updated'])
  assert.equal(harness.state.globalLibrary[0].id, 'alpha-updated')

  const merged = harness.runtime.mergeReference('alpha-updated', { author: 'Doe' })

  assert.equal(merged.status, 'merged')
  assert.equal(merged.ref.author, 'Doe')
  assert.equal(harness.saveCalls.length, 2)
})
