import test from 'node:test'
import assert from 'node:assert/strict'

import { createWorkspaceSnapshotDiffRuntime } from '../src/domains/changes/workspaceSnapshotDiffRuntime.js'

test('workspace snapshot diff runtime builds per-file modified previews without using git history', async () => {
  const runtime = createWorkspaceSnapshotDiffRuntime({
    payloadRuntime: {
      loadWorkspaceSnapshotPayloadManifest: async () => ({
        workspacePath: '/workspace/demo',
        files: [
          {
            path: '/workspace/demo/draft.md',
            relativePath: 'draft.md',
            contentPath: 'files/0.txt',
          },
        ],
      }),
    },
    pathExistsImpl: async () => true,
    readFileImpl: async (path) => {
      if (path.endsWith('files/0.txt')) {
        return 'alpha\nbeta\ncharlie\ndelta\necho'
      }
      if (path === '/workspace/demo/draft.md') {
        return 'alpha\nbeta changed\ncharlie\ndelta updated\necho'
      }
      throw new Error(`unexpected:${path}`)
    },
  })

  const result = await runtime.loadWorkspaceSnapshotFilePreview({
    workspacePath: '/workspace/demo',
    workspaceDataDir: '/workspace/.altals',
    snapshot: { sourceId: 'abc123' },
    filePath: '/workspace/demo/draft.md',
  })

  assert.deepEqual(result, {
    manifest: {
      workspacePath: '/workspace/demo',
      files: [
        {
          path: '/workspace/demo/draft.md',
          relativePath: 'draft.md',
          contentPath: 'files/0.txt',
        },
      ],
    },
    file: {
      path: '/workspace/demo/draft.md',
      relativePath: 'draft.md',
    },
    status: 'modified',
    snapshotContent: 'alpha\nbeta\ncharlie\ndelta\necho',
    currentContent: 'alpha\nbeta changed\ncharlie\ndelta updated\necho',
    summary: {
      firstChangedLine: 2,
      changedLineCount: 3,
      snapshotLineCount: 5,
      currentLineCount: 5,
    },
    snapshotExcerpt: {
      startLine: 1,
      lineCount: 5,
      totalLines: 5,
      truncatedBefore: false,
      truncatedAfter: false,
      lines: ['alpha', 'beta', 'charlie', 'delta', 'echo'],
    },
    currentExcerpt: {
      startLine: 1,
      lineCount: 5,
      totalLines: 5,
      truncatedBefore: false,
      truncatedAfter: false,
      lines: ['alpha', 'beta changed', 'charlie', 'delta updated', 'echo'],
    },
  })
})

test('workspace snapshot diff runtime returns snapshot-only preview when the current workspace file is missing', async () => {
  const runtime = createWorkspaceSnapshotDiffRuntime({
    payloadRuntime: {
      loadWorkspaceSnapshotPayloadManifest: async () => ({
        workspacePath: '/workspace/demo',
        files: [
          {
            path: '/workspace/demo/draft.md',
            relativePath: 'draft.md',
            contentPath: 'files/0.txt',
          },
        ],
      }),
    },
    pathExistsImpl: async () => false,
    readFileImpl: async (path) => {
      if (path.endsWith('files/0.txt')) {
        return 'alpha\nbeta\ngamma'
      }
      throw new Error(`unexpected:${path}`)
    },
  })

  const result = await runtime.loadWorkspaceSnapshotFilePreview({
    workspacePath: '/workspace/demo',
    workspaceDataDir: '/workspace/.altals',
    snapshot: { sourceId: 'abc123' },
    filePath: '/workspace/demo/draft.md',
  })

  assert.deepEqual(result, {
    manifest: {
      workspacePath: '/workspace/demo',
      files: [
        {
          path: '/workspace/demo/draft.md',
          relativePath: 'draft.md',
          contentPath: 'files/0.txt',
        },
      ],
    },
    file: {
      path: '/workspace/demo/draft.md',
      relativePath: 'draft.md',
    },
    status: 'missing',
    snapshotContent: 'alpha\nbeta\ngamma',
    currentContent: '',
    summary: {
      firstChangedLine: 1,
      changedLineCount: 3,
      snapshotLineCount: 3,
      currentLineCount: 0,
    },
    snapshotExcerpt: {
      startLine: 1,
      lineCount: 3,
      totalLines: 3,
      truncatedBefore: false,
      truncatedAfter: false,
      lines: ['alpha', 'beta', 'gamma'],
    },
    currentExcerpt: null,
  })
})
