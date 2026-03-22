import test from 'node:test'
import assert from 'node:assert/strict'

import { createWorkspaceHistoryRepoService } from '../src/services/workspaceHistoryRepo.js'

test('workspace history repo service initializes and seeds a first commit without exposing auto-commit state', async () => {
  const calls = []
  const service = createWorkspaceHistoryRepoService({
    pathExistsImpl: async (path) => {
      calls.push(['pathExists', path])
      return false
    },
    getHomeDirCachedImpl: async () => '/Users/test',
    normalizePathValueImpl: (path) => path,
    gitInitImpl: async (path) => {
      calls.push(['gitInit', path])
    },
    gitLogImpl: async (path, ref, count) => {
      calls.push(['gitLog', path, ref, count])
      return []
    },
    gitAddImpl: async (path) => {
      calls.push(['gitAdd', path])
    },
    gitStatusImpl: async (path) => {
      calls.push(['gitStatus', path])
      return 'M draft.md'
    },
    gitCommitImpl: async (path, message) => {
      calls.push(['gitCommit', path, message])
    },
  })

  const result = await service.ensureWorkspaceHistoryRepo('/workspace/demo', {
    seedInitialCommit: true,
    seedMessage: 'Initial snapshot',
  })

  assert.deepEqual(result, {
    ok: true,
    initialized: true,
    seeded: true,
  })
  assert.equal('autoCommitEnabled' in result, false)
  assert.deepEqual(calls, [
    ['pathExists', '/workspace/demo/.git'],
    ['gitInit', '/workspace/demo'],
    ['gitLog', '/workspace/demo', null, 1],
    ['gitAdd', '/workspace/demo'],
    ['gitStatus', '/workspace/demo'],
    ['gitCommit', '/workspace/demo', 'Initial snapshot'],
  ])
})

test('workspace history repo service skips workspaces that point at the home directory', async () => {
  const service = createWorkspaceHistoryRepoService({
    getHomeDirCachedImpl: async () => '/Users/test',
    normalizePathValueImpl: (path) => path,
  })

  const result = await service.ensureWorkspaceHistoryRepo('/Users/test', {
    seedInitialCommit: true,
  })

  assert.deepEqual(result, {
    ok: false,
    reason: 'home',
  })
})

test('workspace history repo service does not seed when history already exists or there are no changes', async () => {
  const existingHistory = createWorkspaceHistoryRepoService({
    pathExistsImpl: async () => true,
    getHomeDirCachedImpl: async () => '/Users/test',
    normalizePathValueImpl: (path) => path,
    gitLogImpl: async () => [{ hash: 'abc' }],
  })

  assert.deepEqual(
    await existingHistory.ensureWorkspaceHistoryRepo('/workspace/demo', {
      seedInitialCommit: true,
    }),
    {
      ok: true,
      initialized: false,
      seeded: false,
    },
  )

  const emptyWorkspaceCalls = []
  const emptyWorkspace = createWorkspaceHistoryRepoService({
    pathExistsImpl: async () => true,
    getHomeDirCachedImpl: async () => '/Users/test',
    normalizePathValueImpl: (path) => path,
    gitLogImpl: async () => [],
    gitAddImpl: async (path) => {
      emptyWorkspaceCalls.push(['gitAdd', path])
    },
    gitStatusImpl: async (path) => {
      emptyWorkspaceCalls.push(['gitStatus', path])
      return '   '
    },
  })

  assert.deepEqual(
    await emptyWorkspace.ensureWorkspaceHistoryRepo('/workspace/demo', {
      seedInitialCommit: true,
    }),
    {
      ok: true,
      initialized: false,
      seeded: false,
      empty: true,
    },
  )
  assert.deepEqual(emptyWorkspaceCalls, [
    ['gitAdd', '/workspace/demo'],
    ['gitStatus', '/workspace/demo'],
  ])
})
