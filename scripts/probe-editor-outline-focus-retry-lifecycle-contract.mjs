import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
      pending.set(id, { callback, delay })
      return id
    },
    clearTimeout(id) {
      cancelled.push(id)
      pending.delete(id)
    },
    flush(id = null) {
      const entryId = id ?? pending.keys().next().value
      const entry = pending.get(entryId)
      if (!entry) return false
      pending.delete(entryId)
      entry.callback()
      return true
    },
    pendingCount() {
      return pending.size
    },
  }
}

try {
  const { createOutlineFocusRetryLifecycle } =
    await vite.ssrLoadModule('/src/editor/outlineFocusRetryTiming.js')

  const supersedeScheduler = createManualScheduler()
  const supersedeLifecycle = createOutlineFocusRetryLifecycle({
    scheduler: supersedeScheduler,
    maxAttempts: 3,
    retryDelayMs: 40,
  })
  const firstToken = supersedeLifecycle.begin()
  const firstAttempts = []
  supersedeLifecycle.scheduleRetry(firstToken, (attempt) => {
    firstAttempts.push(attempt)
  }, 0)
  const secondToken = supersedeLifecycle.begin()
  const secondAttempts = []
  supersedeLifecycle.scheduleRetry(secondToken, (attempt) => {
    secondAttempts.push(attempt)
  }, 0)
  assert.equal(supersedeLifecycle.isCurrent(firstToken), false)
  assert.equal(supersedeLifecycle.isCurrent(secondToken), true)
  assert.deepEqual(supersedeScheduler.cancelled, [1])
  assert.equal(supersedeScheduler.pendingCount(), 1)
  assert.equal(supersedeScheduler.flush(), true)
  assert.deepEqual(firstAttempts, [])
  assert.deepEqual(secondAttempts, [1])

  const cancelScheduler = createManualScheduler()
  const cancelLifecycle = createOutlineFocusRetryLifecycle({
    scheduler: cancelScheduler,
  })
  const cancelToken = cancelLifecycle.begin()
  const cancelledAttempts = []
  cancelLifecycle.scheduleRetry(cancelToken, (attempt) => {
    cancelledAttempts.push(attempt)
  }, 0)
  cancelLifecycle.cancelPending()
  assert.equal(cancelLifecycle.isCurrent(cancelToken), false)
  assert.equal(cancelScheduler.pendingCount(), 0)
  assert.equal(cancelScheduler.flush(), false)
  assert.deepEqual(cancelledAttempts, [])

  const limitScheduler = createManualScheduler()
  const limitLifecycle = createOutlineFocusRetryLifecycle({
    scheduler: limitScheduler,
    maxAttempts: 2,
  })
  const limitToken = limitLifecycle.begin()
  assert.equal(limitLifecycle.scheduleRetry(limitToken, () => {}, 2), null)
  assert.equal(limitScheduler.pendingCount(), 0)

  const disposedScheduler = createManualScheduler()
  const disposedLifecycle = createOutlineFocusRetryLifecycle({
    scheduler: disposedScheduler,
  })
  const disposedToken = disposedLifecycle.begin()
  disposedLifecycle.scheduleRetry(disposedToken, () => {
    throw new Error('disposed outline retry callback should not run')
  }, 0)
  disposedLifecycle.dispose()
  assert.equal(disposedLifecycle.isCurrent(disposedToken), false)
  assert.equal(disposedScheduler.pendingCount(), 0)
  assert.equal(disposedLifecycle.begin(), null)

  const componentSource = await readFile('src/components/panel/OutlinePanel.vue', 'utf8')
  assert.match(
    componentSource,
    /createOutlineFocusRetryLifecycle\(\)/,
    'OutlinePanel must create an outline focus retry lifecycle controller'
  )
  assert.match(
    componentSource,
    /function focusTextOffset\(path,\s*offset,\s*token,\s*attempts = 0\)[\s\S]*outlineFocusRetryLifecycle\.isCurrent\(token\)[\s\S]*outlineFocusRetryLifecycle\.scheduleRetry/,
    'OutlinePanel focus retry must be guarded by lifecycle token checks'
  )
  assert.match(
    componentSource,
    /const token = outlineFocusRetryLifecycle\.begin\(\)[\s\S]*pendingOutlineFocusPath = targetPath[\s\S]*focusTextOffset\(targetPath,\s*item\.offset,\s*token\)/,
    'OutlinePanel navigation must version each focus retry request and keep the target path'
  )
  assert.match(
    componentSource,
    /watch\(\s*\(\) => activeFile\.value,[\s\S]*pendingOutlineFocusPath && path === pendingOutlineFocusPath[\s\S]*outlineFocusRetryLifecycle\.cancelPending\(\)/,
    'OutlinePanel must cancel stale retries when active file changes away from the pending target'
  )
  assert.match(
    componentSource,
    /onUnmounted\(\(\) => \{[\s\S]*outlineFocusRetryLifecycle\.dispose\(\)/,
    'OutlinePanel must dispose pending focus retries on unmount'
  )

  console.log(JSON.stringify({
    ok: true,
    summary: {
      supersededRetryCancelled: true,
      cancelPendingStopsRetry: true,
      attemptLimitStopsRetry: true,
      disposeStopsRetry: true,
      componentWiring: true,
    },
  }, null, 2))
} finally {
  await vite.close()
}
