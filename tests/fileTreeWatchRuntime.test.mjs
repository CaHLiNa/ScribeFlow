import test from 'node:test'
import assert from 'node:assert/strict'

import { createFileTreeWatchRuntime } from '../src/domains/files/fileTreeWatchRuntime.js'

test('file tree watch runtime schedules polling and tears down listeners', async () => {
  const timers = []
  const clearedTimers = new Set()
  const windowListeners = []
  const documentListeners = []
  let refreshCalls = 0
  let currentVisibility = 'visible'

  const runtime = createFileTreeWatchRuntime({
    getWorkspaceContext: () => ({ path: '/ws' }),
    refreshVisibleTree: async (options = {}) => {
      refreshCalls += 1
      assert.equal(options.reason, 'poll')
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

  assert.equal(windowListeners.length, 1)
  assert.equal(documentListeners.length, 1)
  const activePollTimer = timers.find(timer => timer.delayMs === 15000)
  assert.ok(activePollTimer)
  await activePollTimer.callback()

  assert.equal(refreshCalls, 1)
  assert.equal(timers.filter(timer => timer.delayMs === 15000).length >= 2, true)

  currentVisibility = 'hidden'
  runtime.noteTreeActivity()
  assert.equal(timers.filter(timer => timer.delayMs === 60000).length, 0)

  runtime.stopWatching()
  assert.ok(clearedTimers.size >= 1)
})
