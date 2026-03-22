import test from 'node:test'
import assert from 'node:assert/strict'

import { createWorkspaceSnapshotFileApplyRuntime } from '../src/domains/changes/workspaceSnapshotFileApplyRuntime.js'

test('workspace snapshot file-apply runtime saves content and updates open editor views', async () => {
  const calls = []
  const editorUpdates = []
  const runtime = createWorkspaceSnapshotFileApplyRuntime()

  const applied = await runtime.applyWorkspaceSnapshotFileContent({
    filePath: '/workspace/demo/draft.md',
    content: '# merged result',
    filesStore: {
      saveFile: async (path, content) => {
        calls.push(['saveFile', path, content])
        return true
      },
      reloadFile: async (path) => {
        calls.push(['reloadFile', path])
      },
    },
    editorStore: {
      editorViews: {
        'pane-1:/workspace/demo/draft.md': {
          altalsApplyExternalContent: async (content) => {
            editorUpdates.push(content)
          },
        },
      },
      allOpenFiles: new Set(['/workspace/demo/draft.md']),
      clearFileDirty: (path) => {
        calls.push(['clearDirty', path])
      },
    },
  })

  assert.equal(applied, true)
  assert.deepEqual(editorUpdates, ['# merged result'])
  assert.deepEqual(calls, [
    ['saveFile', '/workspace/demo/draft.md', '# merged result'],
    ['clearDirty', '/workspace/demo/draft.md'],
  ])
})

test('workspace snapshot file-apply runtime reloads open files when no live editor view exists', async () => {
  const calls = []
  const runtime = createWorkspaceSnapshotFileApplyRuntime()

  const applied = await runtime.applyWorkspaceSnapshotFileContent({
    filePath: '/workspace/demo/draft.md',
    content: '# merged result',
    filesStore: {
      saveFile: async (path, content) => {
        calls.push(['saveFile', path, content])
        return true
      },
      reloadFile: async (path) => {
        calls.push(['reloadFile', path])
      },
    },
    editorStore: {
      editorViews: {},
      allOpenFiles: new Set(['/workspace/demo/draft.md']),
      clearFileDirty: (path) => {
        calls.push(['clearDirty', path])
      },
    },
  })

  assert.equal(applied, true)
  assert.deepEqual(calls, [
    ['saveFile', '/workspace/demo/draft.md', '# merged result'],
    ['reloadFile', '/workspace/demo/draft.md'],
    ['clearDirty', '/workspace/demo/draft.md'],
  ])
})

test('workspace snapshot file-apply runtime returns false when the save fails', async () => {
  const calls = []
  const runtime = createWorkspaceSnapshotFileApplyRuntime()

  const applied = await runtime.applyWorkspaceSnapshotFileContent({
    filePath: '/workspace/demo/draft.md',
    content: '# merged result',
    filesStore: {
      saveFile: async (path, content) => {
        calls.push(['saveFile', path, content])
        return false
      },
    },
    editorStore: {
      clearFileDirty: (path) => {
        calls.push(['clearDirty', path])
      },
    },
  })

  assert.equal(applied, false)
  assert.deepEqual(calls, [
    ['saveFile', '/workspace/demo/draft.md', '# merged result'],
  ])
})
