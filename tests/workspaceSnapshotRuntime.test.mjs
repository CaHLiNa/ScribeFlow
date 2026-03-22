import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createWorkspaceSnapshotRecord,
  createWorkspaceSnapshotRuntime,
  getWorkspaceSnapshotDisplayMessage,
  isFileWorkspaceSnapshot,
  isWorkspaceFeedWorkspaceSnapshot,
  isNamedWorkspaceSnapshot,
} from '../src/domains/changes/workspaceSnapshotRuntime.js'

test('workspace snapshot runtime maps git history entries into explicit snapshot records', () => {
  const named = createWorkspaceSnapshotRecord({
    entry: {
      hash: 'abc123',
      date: '2026-03-22T10:11:00Z',
      message: 'Draft 3 ready',
    },
    filePath: '/workspace/demo/draft.md',
  })

  const auto = createWorkspaceSnapshotRecord({
    entry: {
      hash: 'def456',
      date: '2026-03-22T10:12:00Z',
      message: 'Auto: 2026-03-22 10:12',
    },
    filePath: '/workspace/demo/draft.md',
  })

  assert.deepEqual(named, {
    id: 'git:abc123',
    backend: 'git',
    sourceKind: 'git-commit',
    sourceId: 'abc123',
    scope: 'file',
    filePath: '/workspace/demo/draft.md',
    kind: 'named',
    label: 'Draft 3 ready',
    message: 'Draft 3 ready',
    rawMessage: 'Draft 3 ready',
    createdAt: '2026-03-22T10:11:00Z',
    manifest: null,
  })
  assert.equal(isNamedWorkspaceSnapshot(named), true)
  assert.equal(getWorkspaceSnapshotDisplayMessage(named), 'Draft 3 ready')

  assert.equal(auto.kind, 'auto')
  assert.equal(auto.label, '')
  assert.equal(isNamedWorkspaceSnapshot(auto), false)
  assert.equal(isFileWorkspaceSnapshot(named), true)
  assert.equal(isFileWorkspaceSnapshot(auto), true)
  assert.equal(getWorkspaceSnapshotDisplayMessage(auto), 'Auto: 2026-03-22 10:12')
  assert.equal(auto.rawMessage, 'Auto: 2026-03-22 10:12')
  assert.equal(auto.manifest, null)
})

test('workspace snapshot runtime lists file history through the explicit lower git-backed entry point', async () => {
  const calls = []
  const runtime = createWorkspaceSnapshotRuntime({
    versionHistoryRuntime: {
      loadFileHistory: async ({ workspacePath, filePath }) => {
        calls.push(['loadFileHistory', workspacePath, filePath])
        return [
          { hash: 'abc123', date: '2026-03-22T10:11:00Z', message: 'Save: 2026-03-22 10:11' },
        ]
      },
    },
  })

  const result = await runtime.listFileVersionHistoryEntries({
    workspacePath: '/workspace/demo',
    filePath: '/workspace/demo/draft.md',
  })

  assert.deepEqual(calls, [
    ['loadFileHistory', '/workspace/demo', '/workspace/demo/draft.md'],
  ])
  assert.deepEqual(result, [
    {
      id: 'git:abc123',
      backend: 'git',
      sourceKind: 'git-commit',
      sourceId: 'abc123',
      scope: 'file',
      filePath: '/workspace/demo/draft.md',
      kind: 'save',
      label: '',
      message: 'Save: 2026-03-22 10:11',
      rawMessage: 'Save: 2026-03-22 10:11',
      createdAt: '2026-03-22T10:11:00Z',
      manifest: null,
    },
  ])
})

test('workspace snapshot runtime lists only manifest-backed workspace save points in the explicit repo-wide feed', async () => {
  const calls = []
  const runtime = createWorkspaceSnapshotRuntime({
    localSnapshotStoreRuntime: {
      loadWorkspaceSavePointEntries: async ({ workspaceDataDir }) => {
        calls.push(['loadWorkspaceSavePointEntries', workspaceDataDir])
        return []
      },
      syncWorkspaceSavePointEntries: async ({ workspaceDataDir, snapshots }) => {
        calls.push(['syncWorkspaceSavePointEntries', workspaceDataDir, snapshots.length])
        return [{
          id: 'local:workspace:workspace123',
          backend: 'local',
          sourceKind: 'workspace-save-point',
          sourceId: 'workspace123',
          scope: 'workspace',
          filePath: '',
          kind: 'named',
          label: 'Draft 3 ready',
          message: 'Draft 3 ready',
          rawMessage: 'Draft 3 ready [[altals-snapshot:v=1;scope=workspace;kind=named]]',
          createdAt: '2026-03-22T10:13:00.000Z',
          manifest: {
            version: 1,
            scope: 'workspace',
            kind: 'named',
          },
          payload: {
            manifestPath: '/workspace/.altals/snapshots/payloads/workspace123/manifest.json',
            fileCount: 2,
            skippedCount: 1,
            capturedAt: '2026-03-22T10:13:10Z',
            captureScope: 'project-text-set',
          },
        }]
      },
    },
    versionHistoryRuntime: {
      loadWorkspaceHistory: async ({ workspacePath, limit }) => {
        calls.push(['loadWorkspaceHistory', workspacePath, limit])
        return [
          { hash: 'workspace123', date: '2026-03-22T10:13:00Z', message: 'Draft 3 ready [[altals-snapshot:v=1;scope=workspace;kind=named]]' },
          { hash: 'save456', date: '2026-03-22T10:14:00Z', message: 'Save: 2026-03-22 10:14' },
          { hash: 'custom789', date: '2026-03-22T10:15:00Z', message: 'Manual git commit' },
        ]
      },
    },
  })

  const result = await runtime.listWorkspaceSavePointEntries({
    workspacePath: '/workspace/demo',
    workspaceDataDir: '/workspace/.altals',
    limit: 10,
  })

  assert.deepEqual(calls, [
    ['loadWorkspaceSavePointEntries', '/workspace/.altals'],
    ['loadWorkspaceHistory', '/workspace/demo', 10],
    ['syncWorkspaceSavePointEntries', '/workspace/.altals', 1],
  ])
  assert.deepEqual(result, [
    {
      id: 'local:workspace:workspace123',
      backend: 'local',
      sourceKind: 'workspace-save-point',
      sourceId: 'workspace123',
      scope: 'workspace',
      filePath: '',
      kind: 'named',
      label: 'Draft 3 ready',
      message: 'Draft 3 ready',
      rawMessage: 'Draft 3 ready [[altals-snapshot:v=1;scope=workspace;kind=named]]',
      createdAt: '2026-03-22T10:13:00.000Z',
      manifest: {
        version: 1,
        scope: 'workspace',
        kind: 'named',
      },
      payload: {
        manifestPath: '/workspace/.altals/snapshots/payloads/workspace123/manifest.json',
        fileCount: 2,
        skippedCount: 1,
        capturedAt: '2026-03-22T10:13:10Z',
        captureScope: 'project-text-set',
      },
    },
  ])
  assert.equal(isWorkspaceFeedWorkspaceSnapshot(result[0]), true)
})

test('workspace snapshot runtime loads previews and restores by snapshot source id through explicit file-history entry points', async () => {
  const calls = []
  const runtime = createWorkspaceSnapshotRuntime({
    versionHistoryRuntime: {
      loadFileHistoryPreview: async ({ workspacePath, filePath, commitHash }) => {
        calls.push(['loadPreview', workspacePath, filePath, commitHash])
        return '# preview'
      },
      restoreFileHistoryEntry: async ({ workspacePath, filePath, commitHash, reloadFileImpl }) => {
        calls.push(['restore', workspacePath, filePath, commitHash])
        await reloadFileImpl?.(filePath)
        return { restored: true, content: '# preview' }
      },
    },
  })

  const snapshot = {
    id: 'git:abc123',
    backend: 'git',
    sourceKind: 'git-commit',
    sourceId: 'abc123',
    scope: 'file',
    filePath: '/workspace/demo/draft.md',
    kind: 'named',
    label: 'Draft 3 ready',
    message: 'Draft 3 ready',
    createdAt: '2026-03-22T10:11:00Z',
  }

  assert.deepEqual(createWorkspaceSnapshotRecord({
    entry: {
      hash: 'zzz999',
      date: '2026-03-22T10:13:00Z',
      message: 'Save: 2026-03-22 10:13',
    },
  }), {
    id: 'git:zzz999',
    backend: 'git',
    sourceKind: 'git-commit',
    sourceId: 'zzz999',
    scope: 'workspace',
    filePath: '',
    kind: 'save',
    label: '',
    message: 'Save: 2026-03-22 10:13',
    rawMessage: 'Save: 2026-03-22 10:13',
    createdAt: '2026-03-22T10:13:00Z',
    manifest: null,
  })

  assert.equal(
    await runtime.loadFileVersionHistoryPreview({
      workspacePath: '/workspace/demo',
      filePath: '/workspace/demo/draft.md',
      snapshot,
    }),
    '# preview',
  )

  const result = await runtime.restoreFileVersionHistoryEntry({
    workspacePath: '/workspace/demo',
    filePath: '/workspace/demo/draft.md',
    snapshot,
    reloadFileImpl: async (path) => {
      calls.push(['reload', path])
    },
  })

  assert.deepEqual(result, { restored: true, content: '# preview' })
  assert.deepEqual(calls, [
    ['loadPreview', '/workspace/demo', '/workspace/demo/draft.md', 'abc123'],
    ['restore', '/workspace/demo', '/workspace/demo/draft.md', 'abc123'],
    ['reload', '/workspace/demo/draft.md'],
  ])
})

test('workspace snapshot runtime preserves manifest-backed workspace scope inside file history', () => {
  const snapshot = createWorkspaceSnapshotRecord({
    entry: {
      hash: 'workspace123',
      date: '2026-03-22T10:13:00Z',
      message: 'Draft 3 ready [[altals-snapshot:v=1;scope=workspace;kind=named]]',
    },
    filePath: '/workspace/demo/draft.md',
  })

  assert.deepEqual(snapshot, {
    id: 'git:workspace123',
    backend: 'git',
    sourceKind: 'git-commit',
    sourceId: 'workspace123',
    scope: 'workspace',
    filePath: '/workspace/demo/draft.md',
    kind: 'named',
    label: 'Draft 3 ready',
    message: 'Draft 3 ready',
    rawMessage: 'Draft 3 ready [[altals-snapshot:v=1;scope=workspace;kind=named]]',
    createdAt: '2026-03-22T10:13:00Z',
    manifest: {
      version: 1,
      scope: 'workspace',
      kind: 'named',
    },
  })
  assert.equal(isFileWorkspaceSnapshot(snapshot), false)
})

test('workspace snapshot runtime blocks preview and restore for workspace-scoped snapshots', async () => {
  const calls = []
  const runtime = createWorkspaceSnapshotRuntime({
    versionHistoryRuntime: {
      loadFileHistoryPreview: async () => {
        calls.push('preview')
        return '# preview'
      },
      restoreFileHistoryEntry: async () => {
        calls.push('restore')
        return { restored: true }
      },
    },
  })

  const snapshot = createWorkspaceSnapshotRecord({
    entry: {
      hash: 'workspace123',
      date: '2026-03-22T10:13:00Z',
      message: 'Save: 2026-03-22 10:13',
    },
  })

  assert.equal(isFileWorkspaceSnapshot(snapshot), false)
  assert.equal(await runtime.loadFileVersionHistoryPreview({
    workspacePath: '/workspace/demo',
    filePath: '/workspace/demo/draft.md',
    snapshot,
  }), '')
  assert.deepEqual(await runtime.restoreFileVersionHistoryEntry({
    workspacePath: '/workspace/demo',
    filePath: '/workspace/demo/draft.md',
    snapshot,
  }), {
    restored: false,
    reason: 'unsupported-scope',
  })
  assert.deepEqual(calls, [])
})
