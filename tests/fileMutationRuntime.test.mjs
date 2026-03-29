import test from 'node:test'
import assert from 'node:assert/strict'

import { createFileMutationRuntime } from '../src/domains/files/fileMutationRuntime.js'

test('file mutation runtime migrates caches and expanded dirs on rename', async () => {
  const fileContents = { '/ws/old.md': '# draft' }
  const fileLoadErrors = { '/ws/old.md': 'bad' }
  const expandedDirs = new Set(['/ws/old.md'])
  const renameEffects = []
  const syncCalls = []

  const runtime = createFileMutationRuntime({
    renameWorkspaceEntry: async () => ({ ok: true }),
    syncTreeAfterMutation: async (options) => {
      syncCalls.push(options)
    },
    handleRenamedPathEffects: async (oldPath, newPath) => {
      renameEffects.push({ oldPath, newPath })
    },
    hasFileContent: (path) => path in fileContents,
    getFileContent: (path) => fileContents[path],
    setFileContent: (path, value) => {
      fileContents[path] = value
    },
    deleteFileContent: (path) => {
      delete fileContents[path]
    },
    hasFileLoadError: (path) => path in fileLoadErrors,
    getFileLoadError: (path) => fileLoadErrors[path],
    setFileLoadError: (path, value) => {
      fileLoadErrors[path] = value
    },
    deleteFileLoadError: (path) => {
      delete fileLoadErrors[path]
    },
    hasExpandedDir: (path) => expandedDirs.has(path),
    addExpandedDir: (path) => expandedDirs.add(path),
    removeExpandedDir: (path) => expandedDirs.delete(path),
  })

  assert.equal(await runtime.renamePath('/ws/old.md', '/ws/new.md'), true)
  assert.deepEqual(syncCalls, [{ expandPath: '/ws' }])
  assert.deepEqual(fileContents, { '/ws/new.md': '# draft' })
  assert.deepEqual(fileLoadErrors, { '/ws/new.md': 'bad' })
  assert.deepEqual(renameEffects, [{ oldPath: '/ws/old.md', newPath: '/ws/new.md' }])
  assert.deepEqual([...expandedDirs], ['/ws/new.md'])
})

test('file mutation runtime reports rename collisions without syncing tree', async () => {
  const collisions = []

  const runtime = createFileMutationRuntime({
    renameWorkspaceEntry: async () => ({ ok: false }),
    showRenameExistsError: (path) => collisions.push(path),
  })

  assert.equal(await runtime.renamePath('/ws/old.md', '/ws/new.md'), false)
  assert.deepEqual(collisions, ['/ws/new.md'])
})

test('file mutation runtime preserves no-op moves and forwards actual moved destination', async () => {
  const moveEffects = []
  const syncCalls = []

  const runtime = createFileMutationRuntime({
    relocateWorkspacePath: async () => ({ destPath: '/ws/archive/chapter1 2.md' }),
    syncTreeAfterMutation: async (options) => {
      syncCalls.push(options)
    },
    handleMovedPathEffects: async (srcPath, destPath) => {
      moveEffects.push({ srcPath, destPath })
    },
  })

  assert.equal(await runtime.movePath('/ws/archive/chapter1.md', '/ws/archive'), true)
  assert.equal(await runtime.movePath('/ws/docs/chapter1.md', '/ws/archive'), true)
  assert.deepEqual(syncCalls, [{ expandPath: '/ws/archive' }])
  assert.deepEqual(moveEffects, [{
    srcPath: '/ws/docs/chapter1.md',
    destPath: '/ws/archive/chapter1 2.md',
  }])
})

test('file mutation runtime protects deleting-path state and clears caches on delete', async () => {
  const deletingPaths = new Set()
  const fileContents = { '/ws/doc.md': '# draft' }
  const fileLoadErrors = { '/ws/doc.md': 'bad' }
  const deletedEffects = []
  const syncCalls = []

  const runtime = createFileMutationRuntime({
    removeWorkspacePath: async () => {},
    syncTreeAfterMutation: async (options) => {
      syncCalls.push(options || null)
    },
    handleDeletedPathEffects: (path) => deletedEffects.push(path),
    deleteFileContent: (path) => {
      delete fileContents[path]
    },
    deleteFileLoadError: (path) => {
      delete fileLoadErrors[path]
    },
    addDeletingPath: (path) => deletingPaths.add(path),
    removeDeletingPath: (path) => deletingPaths.delete(path),
  })

  assert.equal(await runtime.deletePath('/ws/doc.md'), true)
  assert.deepEqual(syncCalls, [null])
  assert.deepEqual(fileContents, {})
  assert.deepEqual(fileLoadErrors, {})
  assert.deepEqual(deletedEffects, ['/ws/doc.md'])
  assert.deepEqual([...deletingPaths], [])
})
