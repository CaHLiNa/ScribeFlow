import test from 'node:test'
import assert from 'node:assert/strict'

import {
  attachWorkspaceSnapshotMetadata,
  attachWorkspaceSnapshotMetadataList,
  createWorkspaceSnapshotMetadata,
  getWorkspaceSnapshotCapabilities,
  getWorkspaceSnapshotMetadata,
  getWorkspaceSnapshotTitle,
} from '../src/domains/changes/workspaceSnapshotMetadataRuntime.js'

test('workspace snapshot metadata runtime derives titles and capabilities from snapshot records', () => {
  const namedSnapshot = {
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
  const workspaceSnapshot = {
    id: 'git:def456',
    backend: 'git',
    sourceKind: 'git-commit',
    sourceId: 'def456',
    scope: 'workspace',
    filePath: '',
    kind: 'save',
    label: '',
    message: 'Save: 2026-03-22 10:12',
    createdAt: '2026-03-22T10:12:00Z',
  }
  const restorableWorkspaceSnapshot = {
    id: 'local:workspace:payload123',
    backend: 'local',
    sourceKind: 'workspace-save-point',
    sourceId: 'payload123',
    scope: 'workspace',
    filePath: '',
    kind: 'named',
    label: 'Draft 4 ready',
    message: 'Draft 4 ready',
    createdAt: '2026-03-22T10:13:00Z',
    payload: {
      manifestPath: '/workspace/.altals/snapshots/payloads/payload123/manifest.json',
      fileCount: 2,
      skippedCount: 1,
      capturedAt: '2026-03-22T10:13:10Z',
      captureScope: 'project-text-set',
    },
  }
  const loadedRestorableWorkspaceSnapshot = {
    ...restorableWorkspaceSnapshot,
    id: 'local:workspace:loaded123',
    sourceId: 'loaded123',
    payload: {
      manifestPath: '/workspace/.altals/snapshots/payloads/loaded123/manifest.json',
      fileCount: 2,
      skippedCount: 0,
      capturedAt: '2026-03-22T10:13:20Z',
      captureScope: 'loaded-workspace-text',
    },
  }
  const legacyRestorableWorkspaceSnapshot = {
    ...restorableWorkspaceSnapshot,
    id: 'local:workspace:legacy123',
    sourceId: 'legacy123',
    payload: {
      manifestPath: '/workspace/.altals/snapshots/payloads/legacy123/manifest.json',
      fileCount: 1,
      skippedCount: 0,
      capturedAt: '2026-03-22T10:13:30Z',
    },
  }
  const skippedOnlyWorkspaceSnapshot = {
    ...restorableWorkspaceSnapshot,
    id: 'local:workspace:skipped123',
    sourceId: 'skipped123',
    payload: {
      manifestPath: '/workspace/.altals/snapshots/payloads/skipped123/manifest.json',
      fileCount: 0,
      skippedCount: 1,
      capturedAt: '2026-03-22T10:13:40Z',
      captureScope: 'project-text-set',
    },
  }
  const emptyTrackedWorkspaceSnapshot = {
    ...restorableWorkspaceSnapshot,
    id: 'local:workspace:empty123',
    sourceId: 'empty123',
    payload: {
      manifestPath: '/workspace/.altals/snapshots/payloads/empty123/manifest.json',
      fileCount: 0,
      skippedCount: 0,
      capturedAt: '2026-03-22T10:13:50Z',
      captureScope: 'project-text-set',
    },
  }

  assert.equal(getWorkspaceSnapshotTitle(namedSnapshot), 'Draft 3 ready')
  assert.deepEqual(getWorkspaceSnapshotCapabilities(namedSnapshot), {
    canPreview: true,
    canRestore: true,
    canCopy: true,
  })
  assert.deepEqual(createWorkspaceSnapshotMetadata({ snapshot: namedSnapshot }), {
    snapshotId: 'git:abc123',
    scope: 'file',
    backend: 'git',
    sourceKind: 'git-commit',
    kind: 'named',
    title: 'Draft 3 ready',
    message: 'Draft 3 ready',
    isNamed: true,
    isSystemGenerated: false,
    capabilities: {
      canPreview: true,
      canRestore: true,
      canCopy: true,
    },
    payload: null,
  })

  assert.equal(getWorkspaceSnapshotTitle(workspaceSnapshot), 'Save: 2026-03-22 10:12')
  assert.deepEqual(getWorkspaceSnapshotCapabilities(workspaceSnapshot), {
    canPreview: false,
    canRestore: false,
    canCopy: false,
  })
  assert.deepEqual(getWorkspaceSnapshotCapabilities(restorableWorkspaceSnapshot), {
    canPreview: true,
    canRestore: true,
    canCopy: false,
  })
  assert.deepEqual(getWorkspaceSnapshotCapabilities(skippedOnlyWorkspaceSnapshot), {
    canPreview: false,
    canRestore: false,
    canCopy: false,
  })
  assert.deepEqual(getWorkspaceSnapshotCapabilities(emptyTrackedWorkspaceSnapshot), {
    canPreview: false,
    canRestore: false,
    canCopy: false,
  })
  assert.deepEqual(createWorkspaceSnapshotMetadata({ snapshot: restorableWorkspaceSnapshot }).payload, {
    version: 1,
    kind: 'workspace-text-v1',
    manifestPath: '/workspace/.altals/snapshots/payloads/payload123/manifest.json',
    fileCount: 2,
    skippedCount: 1,
    capturedAt: '2026-03-22T10:13:10.000Z',
    captureScope: 'project-text-set',
  })
  assert.equal(
    createWorkspaceSnapshotMetadata({ snapshot: loadedRestorableWorkspaceSnapshot }).payload?.captureScope,
    'loaded-workspace-text',
  )
  assert.equal(
    createWorkspaceSnapshotMetadata({ snapshot: legacyRestorableWorkspaceSnapshot }).payload?.captureScope,
    'open-workspace-files',
  )
  assert.equal(
    createWorkspaceSnapshotMetadata({ snapshot: skippedOnlyWorkspaceSnapshot }).payload?.skippedCount,
    1,
  )
  assert.equal(
    createWorkspaceSnapshotMetadata({ snapshot: emptyTrackedWorkspaceSnapshot }).payload?.fileCount,
    0,
  )
})

test('workspace snapshot metadata runtime attaches metadata and reuses matching attached metadata', () => {
  const snapshot = {
    id: 'git:abc123',
    backend: 'git',
    sourceKind: 'git-commit',
    sourceId: 'abc123',
    scope: 'file',
    filePath: '/workspace/demo/draft.md',
    kind: 'save',
    label: '',
    message: 'Save: 2026-03-22 10:11',
    createdAt: '2026-03-22T10:11:00Z',
  }

  const attached = attachWorkspaceSnapshotMetadata(snapshot)
  assert.equal(attached.metadata.snapshotId, 'git:abc123')
  assert.deepEqual(attachWorkspaceSnapshotMetadataList([snapshot]), [attached])
  assert.equal(getWorkspaceSnapshotMetadata(attached), attached.metadata)
  assert.equal(attached.metadata.payload, null)
})
