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
    flush(id) {
      const entry = pending.get(id)
      if (!entry) return false
      pending.delete(id)
      entry.callback()
      return true
    },
    pendingIds() {
      return [...pending.keys()]
    },
  }
}

try {
  const { createMarkdownPreviewRenderLifecycle } =
    await vite.ssrLoadModule('/src/editor/markdownPreviewRenderTiming.ts')

  const scheduler = createManualScheduler()
  const lifecycle = createMarkdownPreviewRenderLifecycle({ scheduler })
  const renders = []

  const firstHandle = lifecycle.scheduleRender((token) => {
    renders.push({ id: 'first', current: lifecycle.isCurrent(token) })
  }, 300)
  lifecycle.cancelPending()
  assert.equal(scheduler.flush(firstHandle), false)
  assert.deepEqual(renders, [])

  const staleToken = lifecycle.startRender()
  const secondHandle = lifecycle.scheduleRender((token) => {
    renders.push({ id: 'second', current: lifecycle.isCurrent(token) })
  }, 300)
  assert.equal(lifecycle.isCurrent(staleToken), false)
  assert.equal(scheduler.flush(secondHandle), true)
  assert.deepEqual(renders, [{ id: 'second', current: true }])

  const activeToken = lifecycle.startRender()
  assert.equal(lifecycle.isCurrent(activeToken), true)
  lifecycle.dispose()
  assert.equal(lifecycle.isCurrent(activeToken), false)
  assert.deepEqual(lifecycle.getPendingState(), {
    disposed: true,
    render: false,
  })

  const disposedHandle = lifecycle.scheduleRender(() => {
    renders.push({ id: 'disposed', current: true })
  }, 300)
  assert.equal(disposedHandle, null)
  assert.deepEqual(renders, [{ id: 'second', current: true }])

  const componentSource = await readFile('src/components/editor/MarkdownPreview.vue', 'utf8')
  assert.match(
    componentSource,
    /createMarkdownPreviewRenderLifecycle\(\)/,
    'MarkdownPreview must use the render lifecycle controller'
  )
  assert.match(
    componentSource,
    /previewRenderLifecycle\.dispose\(\)/,
    'MarkdownPreview must invalidate pending renders on unmount'
  )
  assert.match(
    componentSource,
    /isRenderCurrent\(token,\s*sourcePath\)/,
    'MarkdownPreview must check render token freshness before committing async results'
  )
  assert.match(
    componentSource,
    /const nextHtml = result instanceof Promise \? await result : result[\s\S]*isRenderCurrent\(token,\s*sourcePath\)[\s\S]*renderedHtml\.value = nextHtml/,
    'MarkdownPreview must re-check render freshness after awaited preview rendering'
  )

  console.log(JSON.stringify({
    ok: true,
    summary: {
      cancelledCount: scheduler.cancelled.length,
      pendingIds: scheduler.pendingIds(),
      renders,
      componentWiring: true,
    },
  }, null, 2))
} finally {
  await vite.close()
}
