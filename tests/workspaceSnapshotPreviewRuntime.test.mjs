import test from 'node:test'
import assert from 'node:assert/strict'

import { createWorkspaceSnapshotPreviewRuntime } from '../src/domains/changes/workspaceSnapshotPreviewRuntime.js'

test('workspace snapshot preview runtime summarizes current workspace file states without using git history', async () => {
  const runtime = createWorkspaceSnapshotPreviewRuntime({
    payloadRuntime: {
      loadWorkspaceSnapshotPayloadManifest: async () => ({
        workspacePath: '/workspace/demo',
        files: [
          {
            path: '/workspace/demo/a.md',
            relativePath: 'a.md',
            contentPath: 'files/0.txt',
          },
          {
            path: '/workspace/demo/b.md',
            relativePath: 'b.md',
            contentPath: 'files/1.txt',
          },
          {
            path: '/workspace/demo/c.md',
            relativePath: 'c.md',
            contentPath: 'files/2.txt',
          },
          {
            path: '/workspace/demo/d.md',
            relativePath: 'd.md',
            contentPath: 'files/3.txt',
          },
        ],
        skippedFiles: [{
          path: '/workspace/demo/e.md',
          relativePath: 'e.md',
          reason: 'read-failed',
        }],
      }),
    },
    deletionRuntime: {
      listWorkspaceSnapshotAddedFiles: async () => ({
        entries: [{
          path: '/workspace/demo/z.md',
          relativePath: 'z.md',
          status: 'added',
        }],
      }),
    },
    pathExistsImpl: async (path) => path !== '/workspace/demo/c.md',
    readFileImpl: async (path) => {
      if (path.endsWith('files/0.txt')) return 'same'
      if (path.endsWith('files/1.txt')) return 'old'
      if (path.endsWith('files/2.txt')) return 'payload-c'
      if (path.endsWith('files/3.txt')) return 'payload-d'
      if (path === '/workspace/demo/a.md') return 'same'
      if (path === '/workspace/demo/b.md') return 'new'
      if (path === '/workspace/demo/d.md') {
        throw new Error('FILE_TOO_LARGE:10485760:20971520')
      }
      throw new Error(`unexpected:${path}`)
    },
  })

  const result = await runtime.loadWorkspaceSnapshotPreviewSummary({
    workspacePath: '/workspace/demo',
    workspaceDataDir: '/workspace/.altals',
    snapshot: {
      sourceId: 'abc123',
    },
  })

  assert.deepEqual(result, {
    manifest: {
      workspacePath: '/workspace/demo',
      files: [
        {
          path: '/workspace/demo/a.md',
          relativePath: 'a.md',
          contentPath: 'files/0.txt',
        },
        {
          path: '/workspace/demo/b.md',
          relativePath: 'b.md',
          contentPath: 'files/1.txt',
        },
        {
          path: '/workspace/demo/c.md',
          relativePath: 'c.md',
          contentPath: 'files/2.txt',
        },
        {
          path: '/workspace/demo/d.md',
          relativePath: 'd.md',
          contentPath: 'files/3.txt',
        },
      ],
      skippedFiles: [{
        path: '/workspace/demo/e.md',
        relativePath: 'e.md',
        reason: 'read-failed',
      }],
    },
    counts: {
      unchanged: 1,
      modified: 1,
      missing: 1,
      unreadable: 0,
      tooLarge: 1,
      added: 1,
    },
    entries: [
      {
        path: '/workspace/demo/a.md',
        relativePath: 'a.md',
        status: 'unchanged',
      },
      {
        path: '/workspace/demo/b.md',
        relativePath: 'b.md',
        status: 'modified',
      },
      {
        path: '/workspace/demo/c.md',
        relativePath: 'c.md',
        status: 'missing',
      },
      {
        path: '/workspace/demo/d.md',
        relativePath: 'd.md',
        status: 'too-large',
      },
    ],
    addedEntries: [{
      path: '/workspace/demo/z.md',
      relativePath: 'z.md',
      status: 'added',
    }],
    skippedFiles: [{
      path: '/workspace/demo/e.md',
      relativePath: 'e.md',
      reason: 'read-failed',
    }],
    reason: '',
  })
})
