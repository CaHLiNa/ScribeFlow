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

function createManualFrameScheduler() {
  const pending = []

  return {
    requestAnimationFrame(callback) {
      pending.push(callback)
      return pending.length
    },
    cancelAnimationFrame() {},
    async flushOne() {
      const callback = pending.shift()
      if (!callback) return false
      callback(Date.now())
      await Promise.resolve()
      return true
    },
    pendingCount() {
      return pending.length
    },
  }
}

try {
  const {
    createPdfForwardSyncLifecycle,
    waitForPdfForwardSyncFrames,
  } = await vite.ssrLoadModule('/src/editor/pdfForwardSyncTiming.js')

  const firstScheduler = createManualFrameScheduler()
  const firstLifecycle = createPdfForwardSyncLifecycle({ scheduler: firstScheduler })
  const firstToken = firstLifecycle.begin()
  const secondToken = firstLifecycle.begin()
  assert.equal(firstLifecycle.isCancelled(firstToken), true)
  assert.equal(firstLifecycle.isCurrent(secondToken), true)

  const waitPromise = waitForPdfForwardSyncFrames(firstLifecycle, secondToken, 2)
  assert.equal(firstScheduler.pendingCount(), 1)
  firstLifecycle.cancelPending()
  await firstScheduler.flushOne()
  assert.equal(await waitPromise, false)

  const activeScheduler = createManualFrameScheduler()
  const activeLifecycle = createPdfForwardSyncLifecycle({ scheduler: activeScheduler })
  const activeToken = activeLifecycle.begin()
  const activeWait = waitForPdfForwardSyncFrames(activeLifecycle, activeToken, 2)
  assert.equal(activeScheduler.pendingCount(), 1)
  await activeScheduler.flushOne()
  assert.equal(activeScheduler.pendingCount(), 1)
  await activeScheduler.flushOne()
  assert.equal(await activeWait, true)

  const disposedLifecycle = createPdfForwardSyncLifecycle()
  const disposedToken = disposedLifecycle.begin()
  disposedLifecycle.dispose()
  assert.equal(await waitForPdfForwardSyncFrames(disposedLifecycle, disposedToken, 1), false)

  const componentSource = await readFile('src/components/editor/PdfEmbedDocumentSurface.vue', 'utf8')
  assert.match(
    componentSource,
    /createPdfForwardSyncLifecycle\(\)/,
    'PdfEmbedDocumentSurface must create a forward-sync lifecycle controller'
  )
  assert.match(
    componentSource,
    /pdfForwardSyncLifecycle\.begin\(\)/,
    'PdfEmbedDocumentSurface must version each forward-sync request'
  )
  assert.match(
    componentSource,
    /waitForPdfForwardSyncFrames\(lifecycle,\s*token,\s*2\)/,
    'PdfEmbedDocumentSurface must make delayed forward-sync frame waits cancellable'
  )
  assert.match(
    componentSource,
    /applyForwardSyncRequest\(nextRequest,\s*{\s*[\s\S]*lifecycle:\s*pdfForwardSyncLifecycle,[\s\S]*token,/,
    'direct forward-sync requests must pass lifecycle tokens into the apply path'
  )
  assert.match(
    componentSource,
    /applyForwardSyncRequest\(queuedRequest,\s*{\s*[\s\S]*lifecycle:\s*pdfForwardSyncLifecycle,[\s\S]*token,/,
    'queued forward-sync retries must pass lifecycle tokens into the apply path'
  )
  assert.match(
    componentSource,
    /pdfForwardSyncLifecycle\.isCancelled\(token\)/,
    'forward-sync completion callbacks must ignore stale lifecycle tokens'
  )
  assert.match(
    componentSource,
    /pdfForwardSyncLifecycle\.cancelPending\(\)/,
    'document cleanup must invalidate pending forward-sync work'
  )
  assert.match(
    componentSource,
    /pdfForwardSyncLifecycle\.dispose\(\)/,
    'unmount cleanup must dispose pending forward-sync work'
  )

  console.log(JSON.stringify({
    ok: true,
    summary: {
      staleTokenCancelled: true,
      frameWaitCancelledBeforeSecondFrame: true,
      activeFrameWaitCompleted: true,
      disposedFrameWaitCancelled: true,
      componentWiring: true,
    },
  }, null, 2))
} finally {
  await vite.close()
}
