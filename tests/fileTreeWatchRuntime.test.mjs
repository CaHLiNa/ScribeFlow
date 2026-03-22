import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createFileTreeWatchRuntime,
  filterRelevantFileWatchPaths,
} from '../src/domains/files/fileTreeWatchRuntime.js'

test('filterRelevantFileWatchPaths excludes .git paths and keeps workspace metadata paths', () => {
  const paths = filterRelevantFileWatchPaths([
    '/ws/chapter1.md',
    '/ws/.git/index',
    '/ws/.altals/project/references/workspace-library.json',
    '/outside/file.txt',
  ], {
    workspacePath: '/ws',
    workspaceDataDir: '/ws/.altals',
  })

  assert.deepEqual(paths, [
    '/ws/chapter1.md',
    '/ws/.altals/project/references/workspace-library.json',
  ])
})

test('file tree watch runtime debounces fs-change events and triggers refresh for workspace paths', async () => {
  const timers = []
  const clearedTimers = new Set()
  const windowListeners = []
  const documentListeners = []
  let fsChangeHandler = null
  let unlistenCalls = 0
  let refreshCalls = 0
  const handledPathBatches = []
  let currentVisibility = 'visible'

  const runtime = createFileTreeWatchRuntime({
    getWorkspaceContext: () => ({
      path: '/ws',
      workspaceDataDir: '/ws/.altals',
    }),
    refreshVisibleTree: async (options = {}) => {
      refreshCalls += 1
      assert.equal(options.reason === 'watch' || options.reason === 'poll', true)
    },
    handleExternalFileChanges: async (changedPaths) => {
      handledPathBatches.push(changedPaths)
    },
    listenToFsChange: async (handler) => {
      fsChangeHandler = handler
      return () => {
        unlistenCalls += 1
      }
    },
    addWindowListener: (type, handler, options) => {
      windowListeners.push({ type, handler, options })
    },
    removeWindowListener: () => {},
    addDocumentListener: (type, handler) => {
      documentListeners.push({ type, handler })
    },
    removeDocumentListener: () => {},
    getVisibilityState: () => currentVisibility,
    createTimer: (callback, delayMs) => {
      const timer = { callback, delayMs }
      timers.push(timer)
      return timer
    },
    clearScheduledTimer: (timer) => {
      clearedTimers.add(timer)
    },
    now: () => 1000,
  })

  await runtime.startWatching()

  assert.ok(fsChangeHandler)
  assert.equal(windowListeners.length, 3)
  assert.equal(documentListeners.length, 1)
  assert.ok(timers.some(timer => timer.delayMs === 5000))

  await fsChangeHandler({
    payload: {
      kind: 'modify',
      paths: [
        '/ws/chapter1.md',
        '/ws/.git/index',
        '/ws/.altals/project/state.json',
      ],
    },
  })

  const debounceTimer = timers.find(timer => timer.delayMs === 300)
  assert.ok(debounceTimer)
  await debounceTimer.callback()

  assert.equal(refreshCalls, 1)
  assert.deepEqual(handledPathBatches, [[
    '/ws/chapter1.md',
    '/ws/.altals/project/state.json',
  ]])

  currentVisibility = 'hidden'
  runtime.noteTreeActivity()
  assert.equal(timers.filter(timer => timer.delayMs === 5000 || timer.delayMs === 20000).length >= 1, true)

  runtime.stopWatching()
  assert.equal(unlistenCalls, 1)
  assert.ok(clearedTimers.size >= 1)
})
