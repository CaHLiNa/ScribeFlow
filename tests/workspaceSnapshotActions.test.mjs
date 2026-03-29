import test from 'node:test'
import assert from 'node:assert/strict'

import { useWorkspaceSnapshotActions } from '../src/app/changes/useWorkspaceSnapshotActions.js'

test('workspace snapshot actions open the workspace snapshot browser only for an open workspace', () => {
  const workspaceSnapshotBrowserVisible = { value: false }
  const actions = useWorkspaceSnapshotActions({
    workspace: { path: '/workspace/demo' },
    filesStore: {},
    editorStore: {},
    toastStore: { show() {} },
    workspaceSnapshotBrowserVisible,
    fileVersionHistoryVisible: { value: false },
    fileVersionHistoryFile: { value: '' },
    t: (value) => value,
  })

  actions.openWorkspaceSnapshots()
  assert.equal(workspaceSnapshotBrowserVisible.value, true)

  workspaceSnapshotBrowserVisible.value = false
  const closedWorkspaceActions = useWorkspaceSnapshotActions({
    workspace: { path: '' },
    filesStore: {},
    editorStore: {},
    toastStore: { show() {} },
    workspaceSnapshotBrowserVisible,
    fileVersionHistoryVisible: { value: false },
    fileVersionHistoryFile: { value: '' },
    t: (value) => value,
  })

  closedWorkspaceActions.openWorkspaceSnapshots()
  assert.equal(workspaceSnapshotBrowserVisible.value, false)
})

test('workspace snapshot actions return snapshot results and allow inline prompt overrides', async () => {
  const expectedResult = {
    committed: true,
    snapshot: {
      id: 'save-point-1',
    },
  }
  const calls = []
  const actions = useWorkspaceSnapshotActions({
    workspace: { path: '/workspace/demo' },
    filesStore: {},
    editorStore: {},
    requestSnapshotLabelImpl() {
      return 'prompt'
    },
    toastStore: { show() {} },
    workspaceSnapshotBrowserVisible: { value: false },
    fileVersionHistoryVisible: { value: false },
    fileVersionHistoryFile: { value: '' },
    createWorkspaceSnapshotImpl: async (input) => {
      calls.push(input)
      return expectedResult
    },
    t: (value) => value,
  })

  const defaultResult = await actions.createSnapshot()
  const manualResult = await actions.createSnapshot({
    requestSnapshotLabel: null,
    allowLocalSavePointWhenUnchanged: true,
    showNoChanges: () => {},
    showCommitFailure: () => {},
  })

  assert.equal(defaultResult, expectedResult)
  assert.equal(manualResult, expectedResult)
  assert.equal(calls.length, 2)
  assert.equal(typeof calls[0].requestSnapshotLabel, 'function')
  assert.equal(calls[1].requestSnapshotLabel, null)
  assert.equal(calls[1].allowLocalSavePointWhenUnchanged, true)
  assert.equal(typeof calls[1].showNoChanges, 'function')
  assert.equal(typeof calls[1].showCommitFailure, 'function')
})
