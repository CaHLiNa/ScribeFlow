import test from 'node:test'
import assert from 'node:assert/strict'

import { createWorkspaceSnapshotProjectTextRuntime } from '../src/domains/changes/workspaceSnapshotProjectTextRuntime.js'

test('workspace snapshot project text runtime filters loaded workspace text paths', () => {
  const runtime = createWorkspaceSnapshotProjectTextRuntime()

  const result = runtime.listLoadedWorkspaceTextPaths({
    workspacePath: '/workspace/demo',
    editorStore: {
      allOpenFiles: new Set([
        '/workspace/demo/draft.md',
        '/workspace/demo/paper.pdf',
        'preview:/workspace/demo/draft.pdf',
      ]),
    },
    filesStore: {
      fileContents: {
        '/workspace/demo/notes.md': 'notes',
        '/workspace/demo/paper.pdf': 'Extracted PDF text',
        '/outside/other.md': 'ignored',
      },
    },
  })

  assert.deepEqual(result, [
    '/workspace/demo/draft.md',
    '/workspace/demo/notes.md',
  ])
})

test('workspace snapshot project text runtime broadens to the indexed project text set and falls back to the current cache on index errors', async () => {
  const runtime = createWorkspaceSnapshotProjectTextRuntime()

  const filesStore = {
    flatFiles: [
      { path: '/workspace/demo/appendix.tex' },
      { path: '/workspace/demo/paper.pdf' },
    ],
    ensureFlatFilesReady: async () => {
      throw new Error('index failed')
    },
    fileContents: {
      '/workspace/demo/draft.md': '# Draft 3',
    },
  }

  const fallbackResult = await runtime.listWorkspaceProjectTextPaths({
    workspacePath: '/workspace/demo',
    editorStore: {
      allOpenFiles: new Set(['/workspace/demo/draft.md']),
    },
    filesStore,
  })

  assert.deepEqual(fallbackResult, [
    '/workspace/demo/appendix.tex',
    '/workspace/demo/draft.md',
  ])

  filesStore.ensureFlatFilesReady = async () => ([
    '/workspace/demo/chapter2.md',
    { path: '/workspace/demo/appendix.tex' },
    { path: '/workspace/demo/paper.pdf' },
  ])

  const indexedResult = await runtime.listWorkspaceProjectTextPaths({
    workspacePath: '/workspace/demo',
    editorStore: {
      allOpenFiles: new Set(['/workspace/demo/draft.md']),
    },
    filesStore,
  })

  assert.deepEqual(indexedResult, [
    '/workspace/demo/appendix.tex',
    '/workspace/demo/chapter2.md',
    '/workspace/demo/draft.md',
  ])
})

test('workspace snapshot project text runtime prefers workspace snapshot flat files when available', async () => {
  const runtime = createWorkspaceSnapshotProjectTextRuntime()

  const filesStore = {
    flatFiles: [],
    readWorkspaceSnapshot: async () => ({
      flatFiles: [
        { path: '/workspace/demo/chapter2.md' },
        { path: '/workspace/demo/appendix.tex' },
        { path: '/workspace/demo/paper.pdf' },
      ],
    }),
    ensureFlatFilesReady: async () => {
      throw new Error('should not be called')
    },
    fileContents: {
      '/workspace/demo/draft.md': '# Draft 3',
    },
  }

  const result = await runtime.listWorkspaceProjectTextPaths({
    workspacePath: '/workspace/demo',
    editorStore: {
      allOpenFiles: new Set(['/workspace/demo/draft.md']),
    },
    filesStore,
  })

  assert.deepEqual(result, [
    '/workspace/demo/appendix.tex',
    '/workspace/demo/chapter2.md',
    '/workspace/demo/draft.md',
  ])
})
