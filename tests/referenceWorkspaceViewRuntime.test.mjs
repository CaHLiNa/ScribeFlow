import test from 'node:test'
import assert from 'node:assert/strict'

import { createReferenceWorkspaceViewRuntime } from '../src/domains/reference/referenceWorkspaceViewRuntime.js'

function createHarness() {
  const state = {
    globalLibrary: [
      { _key: 'alpha', id: 'alpha', title: 'Alpha' },
      { _key: 'beta', id: 'beta', title: 'Beta' },
      { _key: 'gamma', id: 'gamma', title: 'Gamma' },
    ],
    globalKeyMap: {},
    workspaceKeys: ['alpha', 'beta'],
    library: [],
    keyMap: {},
    activeKey: 'missing',
    libraryDetailMode: 'edit',
    selectedKeys: new Set(['alpha']),
  }
  const saves = []

  const runtime = createReferenceWorkspaceViewRuntime({
    getGlobalLibrary: () => state.globalLibrary,
    setGlobalLibrary: (value) => {
      state.globalLibrary = value
    },
    setGlobalKeyMap: (value) => {
      state.globalKeyMap = value
    },
    getWorkspaceKeys: () => state.workspaceKeys,
    setWorkspaceKeys: (value) => {
      state.workspaceKeys = value
    },
    setLibrary: (value) => {
      state.library = value
    },
    setKeyMap: (value) => {
      state.keyMap = value
    },
    getActiveKey: () => state.activeKey,
    setActiveKey: (value) => {
      state.activeKey = value
    },
    setLibraryDetailMode: (value) => {
      state.libraryDetailMode = value
    },
    getSelectedKeys: () => state.selectedKeys,
    setSelectedKeys: (value) => {
      state.selectedKeys = value
    },
    buildKeyMapFromList: (list) => Object.fromEntries(list.map((ref, index) => [ref._key, index])),
    buildWorkspaceLibrary: (globalLibrary, globalKeyMap, workspaceKeys) => ({
      library: workspaceKeys.map((key) => globalLibrary[globalKeyMap[key]]).filter(Boolean),
      keys: workspaceKeys.filter((key) => globalKeyMap[key] !== undefined),
    }),
    referenceKey: (ref) => ref?._key || ref?.id || null,
    saveLibrary: () => {
      saves.push(true)
    },
  })

  return {
    runtime,
    state,
    saves,
  }
}

test('reference workspace view runtime syncs workspace state and clears missing active keys', () => {
  const harness = createHarness()

  const workspaceView = harness.runtime.syncWorkspaceView()

  assert.deepEqual(workspaceView.keys, ['alpha', 'beta'])
  assert.deepEqual(harness.state.globalKeyMap, { alpha: 0, beta: 1, gamma: 2 })
  assert.deepEqual(harness.state.keyMap, { alpha: 0, beta: 1 })
  assert.equal(harness.state.activeKey, null)
  assert.equal(harness.state.libraryDetailMode, 'browse')
})

test('reference workspace view runtime commits global and workbench mutations only when changed', () => {
  const harness = createHarness()

  assert.equal(harness.runtime.commitGlobalReferenceMutations(false), 0)
  assert.equal(harness.runtime.commitWorkbenchMutations(false), 0)
  assert.equal(harness.runtime.commitGlobalReferenceMutations(true), 1)
  assert.equal(harness.runtime.commitWorkbenchMutations(true), 1)
  assert.equal(harness.saves.length, 2)
})

test('reference workspace view runtime applies key renames across workspace state', () => {
  const harness = createHarness()
  harness.state.activeKey = 'alpha'

  const changed = harness.runtime.applyRenamedReferenceKey('alpha', 'alpha-renamed')

  assert.equal(changed, true)
  assert.equal(harness.state.globalLibrary[0]._key, 'alpha-renamed')
  assert.equal(harness.state.globalLibrary[0].id, 'alpha-renamed')
  assert.deepEqual(harness.state.workspaceKeys, ['alpha-renamed', 'beta'])
  assert.equal(harness.state.activeKey, 'alpha-renamed')
  assert.deepEqual([...harness.state.selectedKeys], ['alpha-renamed'])
  assert.equal(harness.saves.length, 1)
})

test('reference workspace view runtime adds and removes workspace keys with persistence', () => {
  const harness = createHarness()

  assert.equal(harness.runtime.addKeyToWorkspace('gamma'), true)
  assert.deepEqual(harness.state.workspaceKeys, ['alpha', 'beta', 'gamma'])
  assert.equal(harness.runtime.removeReference('beta'), true)
  assert.deepEqual(harness.state.workspaceKeys, ['alpha', 'gamma'])
  assert.equal(harness.saves.length, 2)
})

test('reference workspace view runtime applies global removals and clears selection state', () => {
  const harness = createHarness()
  harness.state.activeKey = 'beta'
  harness.state.selectedKeys = new Set(['alpha', 'beta'])

  const removed = harness.runtime.applyGlobalRemoval(['beta', 'gamma'])

  assert.deepEqual(removed, ['beta', 'gamma'])
  assert.deepEqual(harness.state.globalLibrary.map((ref) => ref._key), ['alpha'])
  assert.deepEqual(harness.state.workspaceKeys, ['alpha'])
  assert.equal(harness.state.activeKey, null)
  assert.equal(harness.state.libraryDetailMode, 'browse')
  assert.deepEqual([...harness.state.selectedKeys], ['alpha'])
})
