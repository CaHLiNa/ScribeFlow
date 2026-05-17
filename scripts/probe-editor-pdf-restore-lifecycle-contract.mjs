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
    createPdfRestoreLifecycle,
    waitForPdfRestoreFrames,
  } = await vite.ssrLoadModule('/src/editor/pdfRestoreTiming.js')

  const firstScheduler = createManualFrameScheduler()
  const firstLifecycle = createPdfRestoreLifecycle({ scheduler: firstScheduler })
  const firstToken = firstLifecycle.begin()
  const secondToken = firstLifecycle.begin()
  assert.equal(firstLifecycle.isCancelled(firstToken), true)
  assert.equal(firstLifecycle.isCurrent(secondToken), true)

  const waitingRestore = waitForPdfRestoreFrames(firstLifecycle, secondToken, 2)
  assert.equal(firstScheduler.pendingCount(), 1)
  firstLifecycle.cancelPending()
  await firstScheduler.flushOne()
  assert.equal(await waitingRestore, false)

  const activeScheduler = createManualFrameScheduler()
  const activeLifecycle = createPdfRestoreLifecycle({ scheduler: activeScheduler })
  const activeToken = activeLifecycle.begin()
  const activeRestore = waitForPdfRestoreFrames(activeLifecycle, activeToken, 3)
  assert.equal(activeScheduler.pendingCount(), 1)
  await activeScheduler.flushOne()
  assert.equal(activeScheduler.pendingCount(), 1)
  await activeScheduler.flushOne()
  assert.equal(activeScheduler.pendingCount(), 1)
  await activeScheduler.flushOne()
  assert.equal(await activeRestore, true)

  const disposedLifecycle = createPdfRestoreLifecycle()
  const disposedToken = disposedLifecycle.begin()
  disposedLifecycle.dispose()
  assert.equal(await waitForPdfRestoreFrames(disposedLifecycle, disposedToken, 1), false)

  const componentSource = await readFile('src/components/editor/PdfEmbedDocumentSurface.vue', 'utf8')
  assert.match(
    componentSource,
    /createPdfRestoreLifecycle\(\)/,
    'PdfEmbedDocumentSurface must create a restore lifecycle controller'
  )
  assert.match(
    componentSource,
    /function cancelPendingPdfRestore\(\)[\s\S]*restoreRevision \+= 1[\s\S]*pdfRestoreLifecycle\.cancelPending\(\)/,
    'restore cleanup must invalidate revision and lifecycle token together'
  )
  assert.match(
    componentSource,
    /function isPdfRestoreCancelled\(currentRevision,\s*documentId,\s*lifecycle,\s*token\)/,
    'restore path must check revision, document identity and lifecycle token'
  )
  assert.match(
    componentSource,
    /waitForPdfRestoreFrames\(lifecycle,\s*token,\s*2\)/,
    'restore path must make the initial two-frame wait cancellable'
  )
  assert.match(
    componentSource,
    /waitForPdfRestoreFrames\(lifecycle,\s*token,\s*1\)/,
    'restore path must make the post-page-scroll frame wait cancellable'
  )
  assert.match(
    componentSource,
    /watch\(\s*\(\) => props\.restoreState,[\s\S]*cancelPendingPdfRestore\(\)/,
    'restoreState changes must cancel stale pending restore work'
  )
  assert.match(
    componentSource,
    /watch\(\s*\(\) => props\.documentId,[\s\S]*cancelPendingPdfRestore\(\)/,
    'documentId changes must cancel stale pending restore work'
  )
  assert.match(
    componentSource,
    /pdfRestoreLifecycle\.begin\(\)[\s\S]*restoreViewState\(pendingRestoreState\.value,\s*{\s*[\s\S]*lifecycle:\s*pdfRestoreLifecycle,[\s\S]*token,/,
    'layout-ready restore must pass lifecycle tokens into restoreViewState'
  )
  assert.match(
    componentSource,
    /pdfRestoreLifecycle\.isCancelled\(token\)[\s\S]*scheduleInitialPaintRefresh\(\)/,
    'restore completion callback must ignore stale lifecycle tokens before scheduling paint refresh'
  )
  assert.match(
    componentSource,
    /pdfRestoreLifecycle\.dispose\(\)/,
    'unmount cleanup must dispose pending restore work'
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
