import assert from 'node:assert/strict'
import { createLogger, createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  logLevel: 'error',
  customLogger: createLogger('error', {
    customConsole: {
      ...console,
      error(message, ...rest) {
        const rendered = String(message || '')
        if (rendered.includes('WebSocket server error:')) return
        console.error(message, ...rest)
      },
    },
  }),
})

function createManualScheduler() {
  let nextId = 1
  const pending = new Map()
  const cancelled = []

  return {
    cancelled,
    setTimeout(callback, delay) {
      const id = nextId++
      pending.set(id, { callback, delay, kind: 'timeout' })
      return id
    },
    clearTimeout(id) {
      cancelled.push(id)
      pending.delete(id)
    },
    requestAnimationFrame(callback) {
      const id = nextId++
      pending.set(id, { callback, kind: 'frame' })
      return id
    },
    cancelAnimationFrame(id) {
      cancelled.push(id)
      pending.delete(id)
    },
    flush(id) {
      const entry = pending.get(id)
      if (!entry) return false
      pending.delete(id)
      entry.callback(123)
      return true
    },
    pendingIds() {
      return [...pending.keys()]
    },
  }
}

try {
  const { createEditorMarkdownSyncTimingController } =
    await vite.ssrLoadModule('/src/editor/markdownSyncTiming.ts')

  const scheduler = createManualScheduler()
  const controller = createEditorMarkdownSyncTimingController({ scheduler })
  const dispatches = []

  const staleSelectionHandle = controller.scheduleSelection(() => {
    dispatches.push('stale-selection')
  }, 90)
  controller.cancelSelection()
  assert.equal(scheduler.flush(staleSelectionHandle), false)
  assert.deepEqual(dispatches, [])

  const firstSelectionHandle = controller.scheduleSelection(() => {
    dispatches.push('first-selection')
  }, 90)
  const secondSelectionHandle = controller.scheduleSelection(() => {
    dispatches.push('second-selection')
  }, 90)
  assert.equal(scheduler.flush(firstSelectionHandle), false)
  assert.equal(scheduler.flush(secondSelectionHandle), true)
  assert.deepEqual(dispatches, ['second-selection'])

  const staleViewportHandle = controller.scheduleViewport(() => {
    dispatches.push('stale-viewport')
  })
  controller.cancelAll()
  assert.equal(scheduler.flush(staleViewportHandle), false)

  const currentViewportHandle = controller.scheduleViewport(() => {
    dispatches.push('current-viewport')
  })
  assert.deepEqual(controller.getPendingState(), {
    selection: false,
    viewport: true,
  })
  assert.equal(scheduler.flush(currentViewportHandle), true)
  assert.deepEqual(controller.getPendingState(), {
    selection: false,
    viewport: false,
  })
  assert.deepEqual(dispatches, ['second-selection', 'current-viewport'])

  console.log(JSON.stringify({
    ok: true,
    summary: {
      dispatches,
      cancelledCount: scheduler.cancelled.length,
      pendingIds: scheduler.pendingIds(),
    },
  }, null, 2))
} finally {
  await vite.close()
}
