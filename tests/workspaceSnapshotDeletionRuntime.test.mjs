import test from 'node:test'
import assert from 'node:assert/strict'

import { createWorkspaceSnapshotDeletionRuntime } from '../src/domains/changes/workspaceSnapshotDeletionRuntime.js'

test('workspace snapshot deletion runtime lists in-scope files added after the selected save point', async () => {
  const runtime = createWorkspaceSnapshotDeletionRuntime({
    payloadRuntime: {
      loadWorkspaceSnapshotPayloadManifest: async () => ({
        workspacePath: '/workspace/demo',
        files: [{
          path: '/workspace/demo/a.md',
          relativePath: 'a.md',
          contentPath: 'files/0.txt',
        }],
        skippedFiles: [{
          path: '/workspace/demo/b.md',
          relativePath: 'b.md',
          reason: 'too-large',
        }],
      }),
    },
    projectTextRuntime: {
      listWorkspaceProjectTextPaths: async () => [
        '/workspace/demo/a.md',
        '/workspace/demo/b.md',
        '/workspace/demo/c.md',
      ],
    },
  })

  const result = await runtime.listWorkspaceSnapshotAddedFiles({
    workspacePath: '/workspace/demo',
    workspaceDataDir: '/workspace/.altals',
    snapshot: {
      sourceId: 'abc123',
    },
  })

  assert.deepEqual(result, {
    manifest: {
      workspacePath: '/workspace/demo',
      files: [{
        path: '/workspace/demo/a.md',
        relativePath: 'a.md',
        contentPath: 'files/0.txt',
      }],
      skippedFiles: [{
        path: '/workspace/demo/b.md',
        relativePath: 'b.md',
        reason: 'too-large',
      }],
    },
    entries: [{
      path: '/workspace/demo/c.md',
      relativePath: 'c.md',
      status: 'added',
    }],
    reason: '',
  })
})

test('workspace snapshot deletion runtime removes only the targeted added files', async () => {
  const removed = []
  const runtime = createWorkspaceSnapshotDeletionRuntime({
    payloadRuntime: {
      loadWorkspaceSnapshotPayloadManifest: async () => ({
        workspacePath: '/workspace/demo',
        files: [{
          path: '/workspace/demo/a.md',
          relativePath: 'a.md',
          contentPath: 'files/0.txt',
        }],
        skippedFiles: [],
      }),
    },
    projectTextRuntime: {
      listWorkspaceProjectTextPaths: async () => [
        '/workspace/demo/a.md',
        '/workspace/demo/c.md',
        '/workspace/demo/d.md',
      ],
    },
  })

  const result = await runtime.removeWorkspaceSnapshotAddedFiles({
    workspacePath: '/workspace/demo',
    workspaceDataDir: '/workspace/.altals',
    snapshot: {
      sourceId: 'abc123',
    },
    targetPaths: ['/workspace/demo/d.md'],
    deletePath: async (filePath) => {
      removed.push(filePath)
      return true
    },
  })

  assert.deepEqual(removed, ['/workspace/demo/d.md'])
  assert.deepEqual(result, {
    removed: true,
    removedFiles: ['/workspace/demo/d.md'],
    manifest: {
      workspacePath: '/workspace/demo',
      files: [{
        path: '/workspace/demo/a.md',
        relativePath: 'a.md',
        contentPath: 'files/0.txt',
      }],
      skippedFiles: [],
    },
    candidates: [
      {
        path: '/workspace/demo/c.md',
        relativePath: 'c.md',
        status: 'added',
      },
      {
        path: '/workspace/demo/d.md',
        relativePath: 'd.md',
        status: 'added',
      },
    ],
  })
})
