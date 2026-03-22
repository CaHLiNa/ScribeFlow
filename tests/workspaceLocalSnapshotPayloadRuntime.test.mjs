import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createWorkspaceLocalSnapshotPayloadRuntime,
  createWorkspaceSnapshotPayloadManifest,
  createWorkspaceSnapshotPayloadMeta,
  resolveWorkspaceSnapshotPayloadManifestPath,
} from '../src/domains/changes/workspaceLocalSnapshotPayloadRuntime.js'

test('workspace local snapshot payload runtime resolves the payload manifest path', () => {
  assert.equal(
    resolveWorkspaceSnapshotPayloadManifestPath('/workspace/.altals', {
      sourceId: 'abc123',
    }),
    '/workspace/.altals/snapshots/payloads/abc123/manifest.json',
  )
})

test('workspace local snapshot payload runtime captures a manifest-backed payload for the indexed project text set while excluding binary paths', async () => {
  const files = new Map([
    ['/workspace/demo/chapter2.md', '## Chapter 2'],
    ['/workspace/demo/draft.md', '# Draft 3'],
  ])
  const writes = []
  const createDirs = []
  const runtime = createWorkspaceLocalSnapshotPayloadRuntime({
    readFileImpl: async (path) => {
      if (path === '/workspace/demo/large.md') {
        throw new Error('FILE_TOO_LARGE:10485760:20971520')
      }
      if (!files.has(path)) {
        throw new Error('missing')
      }
      return files.get(path)
    },
    writeFileImpl: async (path, content) => {
      writes.push([path, content])
      files.set(path, content)
    },
    createDirImpl: async (path) => {
      createDirs.push(path)
    },
  })

  const payload = await runtime.captureWorkspaceSnapshotPayload({
    workspacePath: '/workspace/demo',
    workspaceDataDir: '/workspace/.altals',
    snapshot: {
      sourceId: 'abc123',
      createdAt: '2026-03-22T10:11:00Z',
      message: 'Draft 3 ready',
    },
    editorStore: {
      allOpenFiles: new Set([
        '/workspace/demo/draft.md',
        '/workspace/demo/paper.pdf',
        'preview:/workspace/demo/draft.pdf',
      ]),
    },
    filesStore: {
      ensureFlatFilesReady: async () => ([
        '/workspace/demo/appendix.md',
        '/workspace/demo/chapter2.md',
        '/workspace/demo/draft.md',
        '/workspace/demo/large.md',
        '/workspace/demo/paper.pdf',
      ]),
      fileContents: {
        '/workspace/demo/notes.md': 'notes',
        '/workspace/demo/paper.pdf': 'Extracted PDF text',
      },
    },
  })

  assert.deepEqual(createDirs, [
    '/workspace/.altals/snapshots/payloads/abc123',
    '/workspace/.altals/snapshots/payloads/abc123/files',
  ])
  assert.deepEqual(payload, {
    version: 1,
    kind: 'workspace-text-v1',
    manifestPath: '/workspace/.altals/snapshots/payloads/abc123/manifest.json',
    fileCount: 3,
    skippedCount: 2,
    capturedAt: payload.capturedAt,
    captureScope: 'project-text-set',
  })
  assert.ok(typeof payload.capturedAt === 'string' && payload.capturedAt.length > 0)

  const manifest = JSON.parse(files.get('/workspace/.altals/snapshots/payloads/abc123/manifest.json'))
  assert.deepEqual(manifest, createWorkspaceSnapshotPayloadManifest({
    workspacePath: '/workspace/demo',
    snapshot: {
      sourceId: 'abc123',
      createdAt: '2026-03-22T10:11:00Z',
      message: 'Draft 3 ready',
    },
    payload,
    files: [
      {
        path: '/workspace/demo/chapter2.md',
        relativePath: 'chapter2.md',
        contentPath: 'files/0.txt',
      },
      {
        path: '/workspace/demo/draft.md',
        relativePath: 'draft.md',
        contentPath: 'files/1.txt',
      },
      {
        path: '/workspace/demo/notes.md',
        relativePath: 'notes.md',
        contentPath: 'files/2.txt',
      },
    ],
    skippedFiles: [
      {
        path: '/workspace/demo/appendix.md',
        relativePath: 'appendix.md',
        reason: 'read-failed',
      },
      {
        path: '/workspace/demo/large.md',
        relativePath: 'large.md',
        reason: 'too-large',
      },
    ],
  }))
  assert.equal(manifest.files.some((file) => file.path === '/workspace/demo/paper.pdf'), false)
  assert.equal(manifest.skippedCount, 2)
  assert.equal(files.get('/workspace/.altals/snapshots/payloads/abc123/files/0.txt'), '## Chapter 2')
  assert.equal(files.get('/workspace/.altals/snapshots/payloads/abc123/files/1.txt'), '# Draft 3')
  assert.equal(files.get('/workspace/.altals/snapshots/payloads/abc123/files/2.txt'), 'notes')
})

test('workspace local snapshot payload runtime records skipped-only payload manifests when no project text files were restorable', async () => {
  const files = new Map()
  const writes = []
  const runtime = createWorkspaceLocalSnapshotPayloadRuntime({
    projectTextRuntime: {
      listWorkspaceProjectTextPaths: async () => ['/workspace/demo/large.md'],
    },
    readFileImpl: async () => {
      throw new Error('FILE_TOO_LARGE:10485760:20971520')
    },
    writeFileImpl: async (path, content) => {
      writes.push([path, content])
      files.set(path, content)
    },
    createDirImpl: async () => {},
  })

  const payload = await runtime.captureWorkspaceSnapshotPayload({
    workspacePath: '/workspace/demo',
    workspaceDataDir: '/workspace/.altals',
    snapshot: {
      sourceId: 'skipped123',
      createdAt: '2026-03-22T10:11:00Z',
      message: 'Draft 3 ready',
    },
    editorStore: { allOpenFiles: new Set() },
    filesStore: { fileContents: {} },
  })

  assert.deepEqual(payload, {
    version: 1,
    kind: 'workspace-text-v1',
    manifestPath: '/workspace/.altals/snapshots/payloads/skipped123/manifest.json',
    fileCount: 0,
    skippedCount: 1,
    capturedAt: payload.capturedAt,
    captureScope: 'project-text-set',
  })
  assert.equal(writes.length, 1)

  const manifest = JSON.parse(files.get('/workspace/.altals/snapshots/payloads/skipped123/manifest.json'))
  assert.deepEqual(manifest, createWorkspaceSnapshotPayloadManifest({
    workspacePath: '/workspace/demo',
    snapshot: {
      sourceId: 'skipped123',
      createdAt: '2026-03-22T10:11:00Z',
      message: 'Draft 3 ready',
    },
    payload,
    files: [],
    skippedFiles: [{
      path: '/workspace/demo/large.md',
      relativePath: 'large.md',
      reason: 'too-large',
    }],
  }))
})

test('workspace local snapshot payload runtime records empty payload manifests when the project text set is empty', async () => {
  const files = new Map()
  const writes = []
  const createDirs = []
  const runtime = createWorkspaceLocalSnapshotPayloadRuntime({
    projectTextRuntime: {
      listWorkspaceProjectTextPaths: async () => [],
    },
    writeFileImpl: async (path, content) => {
      writes.push([path, content])
      files.set(path, content)
    },
    createDirImpl: async (path) => {
      createDirs.push(path)
    },
  })

  const payload = await runtime.captureWorkspaceSnapshotPayload({
    workspacePath: '/workspace/demo',
    workspaceDataDir: '/workspace/.altals',
    snapshot: {
      sourceId: 'empty123',
      createdAt: '2026-03-22T10:11:00Z',
      message: 'Draft 3 ready',
    },
    editorStore: { allOpenFiles: new Set() },
    filesStore: { fileContents: {} },
  })

  assert.deepEqual(createDirs, [
    '/workspace/.altals/snapshots/payloads/empty123',
    '/workspace/.altals/snapshots/payloads/empty123/files',
  ])
  assert.deepEqual(payload, {
    version: 1,
    kind: 'workspace-text-v1',
    manifestPath: '/workspace/.altals/snapshots/payloads/empty123/manifest.json',
    fileCount: 0,
    skippedCount: 0,
    capturedAt: payload.capturedAt,
    captureScope: 'project-text-set',
  })
  assert.deepEqual(writes, [[
    '/workspace/.altals/snapshots/payloads/empty123/manifest.json',
    JSON.stringify(createWorkspaceSnapshotPayloadManifest({
      workspacePath: '/workspace/demo',
      snapshot: {
        sourceId: 'empty123',
        createdAt: '2026-03-22T10:11:00Z',
        message: 'Draft 3 ready',
      },
      payload,
      files: [],
      skippedFiles: [],
    }), null, 2),
  ]])
})

test('workspace local snapshot payload runtime restores captured file contents through the injected apply function', async () => {
  const files = new Map()
  const manifestPath = '/workspace/.altals/snapshots/payloads/abc123/manifest.json'
  files.set(manifestPath, JSON.stringify({
    version: 1,
    kind: 'workspace-text-v1',
    workspacePath: '/workspace/demo',
    snapshot: {
      sourceId: 'abc123',
      createdAt: '2026-03-22T10:11:00Z',
      message: 'Draft 3 ready',
    },
    capturedAt: '2026-03-22T10:11:30Z',
    fileCount: 1,
    captureScope: 'open-workspace-files',
    files: [{
      path: '/workspace/demo/draft.md',
      relativePath: 'draft.md',
      contentPath: 'files/0.txt',
    }],
  }))
  files.set('/workspace/.altals/snapshots/payloads/abc123/files/0.txt', '# Restored')

  const restored = []
  const runtime = createWorkspaceLocalSnapshotPayloadRuntime({
    readFileImpl: async (path) => {
      if (!files.has(path)) {
        throw new Error('missing')
      }
      return files.get(path)
    },
  })

  const result = await runtime.restoreWorkspaceSnapshotPayload({
    workspacePath: '/workspace/demo',
    workspaceDataDir: '/workspace/.altals',
    snapshot: {
      sourceId: 'abc123',
      payload: createWorkspaceSnapshotPayloadMeta({
        manifestPath,
        fileCount: 1,
        capturedAt: '2026-03-22T10:11:30Z',
      }),
    },
    applyFileContent: async (path, content) => {
      restored.push([path, content])
      return true
    },
  })

  assert.deepEqual(restored, [['/workspace/demo/draft.md', '# Restored']])
  assert.equal(result.restored, true)
  assert.deepEqual(result.restoredFiles, ['/workspace/demo/draft.md'])
})

test('workspace local snapshot payload runtime can restore only the selected captured files', async () => {
  const files = new Map()
  const manifestPath = '/workspace/.altals/snapshots/payloads/abc123/manifest.json'
  files.set(manifestPath, JSON.stringify({
    version: 1,
    kind: 'workspace-text-v1',
    workspacePath: '/workspace/demo',
    snapshot: {
      sourceId: 'abc123',
      createdAt: '2026-03-22T10:11:00Z',
      message: 'Draft 3 ready',
    },
    capturedAt: '2026-03-22T10:11:30Z',
    fileCount: 2,
    captureScope: 'project-text-set',
    files: [
      {
        path: '/workspace/demo/draft.md',
        relativePath: 'draft.md',
        contentPath: 'files/0.txt',
      },
      {
        path: '/workspace/demo/notes.md',
        relativePath: 'notes.md',
        contentPath: 'files/1.txt',
      },
    ],
  }))
  files.set('/workspace/.altals/snapshots/payloads/abc123/files/0.txt', '# Restored draft')
  files.set('/workspace/.altals/snapshots/payloads/abc123/files/1.txt', '# Restored notes')

  const restored = []
  const runtime = createWorkspaceLocalSnapshotPayloadRuntime({
    readFileImpl: async (path) => {
      if (!files.has(path)) {
        throw new Error('missing')
      }
      return files.get(path)
    },
  })

  const result = await runtime.restoreWorkspaceSnapshotPayload({
    workspacePath: '/workspace/demo',
    workspaceDataDir: '/workspace/.altals',
    snapshot: {
      sourceId: 'abc123',
      payload: createWorkspaceSnapshotPayloadMeta({
        manifestPath,
        fileCount: 2,
        capturedAt: '2026-03-22T10:11:30Z',
        captureScope: 'project-text-set',
      }),
    },
    targetPaths: ['/workspace/demo/notes.md'],
    applyFileContent: async (path, content) => {
      restored.push([path, content])
      return true
    },
  })

  assert.deepEqual(restored, [['/workspace/demo/notes.md', '# Restored notes']])
  assert.equal(result.restored, true)
  assert.deepEqual(result.restoredFiles, ['/workspace/demo/notes.md'])
})
