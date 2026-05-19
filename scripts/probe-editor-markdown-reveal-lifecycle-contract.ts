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
  const pending = []

  return {
    setTimeout(callback, delay) {
      pending.push({ callback, delay })
      return pending.length
    },
    clearTimeout() {},
    async flushOne() {
      const entry = pending.shift()
      if (!entry) return false
      entry.callback()
      await Promise.resolve()
      return true
    },
    pendingCount() {
      return pending.length
    },
  }
}

function createEditorStore({ viewAppearsAfterPolls = 1 } = {}) {
  const calls = {
    findPane: 0,
    getAnyEditorView: 0,
    openFile: 0,
    openFileInPane: 0,
  }
  const view = {
    state: {
      doc: {
        length: 12,
        lines: 1,
        line() {
          return { from: 0 }
        },
      },
    },
    dispatch() {},
    focus() {},
  }

  return {
    calls,
    activePaneId: 'pane-a',
    paneTree: {},
    findPane() {
      calls.findPane += 1
      return null
    },
    openFile() {
      calls.openFile += 1
    },
    openFileInPane() {
      calls.openFileInPane += 1
    },
    getAnyEditorView() {
      calls.getAnyEditorView += 1
      return calls.getAnyEditorView > viewAppearsAfterPolls ? view : null
    },
  }
}

try {
  const { createMarkdownRevealLifecycle } =
    await vite.ssrLoadModule('/src/editor/markdownRevealTiming.ts')
  const {
    revealMarkdownSourceLocation,
    waitForMarkdownEditorViewWithLifecycle,
  } = await vite.ssrLoadModule('/src/services/markdown/reveal.ts')

  const firstScheduler = createManualScheduler()
  const firstLifecycle = createMarkdownRevealLifecycle({ scheduler: firstScheduler })
  const firstToken = firstLifecycle.begin()
  const secondToken = firstLifecycle.begin()
  assert.equal(firstLifecycle.isCancelled(firstToken), true)
  assert.equal(firstLifecycle.isCurrent(secondToken), true)

  const waitingStore = createEditorStore({ viewAppearsAfterPolls: 99 })
  const waitingPromise = waitForMarkdownEditorViewWithLifecycle(waitingStore, '/tmp/a.md', {
    lifecycle: firstLifecycle,
    token: secondToken,
    timeoutMs: 100,
  })
  assert.equal(firstScheduler.pendingCount(), 1)
  firstLifecycle.cancelPending()
  await firstScheduler.flushOne()
  assert.equal(await waitingPromise, null)
  assert.equal(waitingStore.calls.getAnyEditorView, 1)

  const disposedStore = createEditorStore({ viewAppearsAfterPolls: 0 })
  const disposedLifecycle = createMarkdownRevealLifecycle()
  const disposedToken = disposedLifecycle.begin()
  disposedLifecycle.dispose()
  const disposedResult = await revealMarkdownSourceLocation(disposedStore, {
    filePath: '/tmp/disposed.md',
    line: 1,
    offset: 0,
  }, {
    lifecycle: disposedLifecycle,
    token: disposedToken,
  })
  assert.equal(disposedResult, false)
  assert.equal(disposedStore.calls.openFile, 0)

  const activeStore = createEditorStore({ viewAppearsAfterPolls: 0 })
  const activeLifecycle = createMarkdownRevealLifecycle()
  const activeToken = activeLifecycle.begin()
  const activeResult = await revealMarkdownSourceLocation(activeStore, {
    filePath: '/tmp/active.md',
    line: 1,
    offset: 0,
  }, {
    lifecycle: activeLifecycle,
    token: activeToken,
  })
  assert.equal(activeResult, true)
  assert.equal(activeStore.calls.openFile, 1)

  const componentSource = await readFile('src/components/editor/MarkdownPreview.vue', 'utf8')
  assert.match(
    componentSource,
    /createMarkdownRevealLifecycle\(\)/,
    'MarkdownPreview must create a reveal lifecycle controller'
  )
  assert.match(
    componentSource,
    /previewRevealLifecycle\.begin\(\)/,
    'MarkdownPreview must version each source reveal request'
  )
  assert.match(
    componentSource,
    /previewRevealLifecycle\.dispose\(\)/,
    'MarkdownPreview must invalidate pending source reveal requests on unmount'
  )
  assert.match(
    componentSource,
    /lifecycle:\s*previewRevealLifecycle[\s\S]*token,/,
    'MarkdownPreview must pass reveal lifecycle tokens into the markdown reveal service'
  )

  console.log(JSON.stringify({
    ok: true,
    summary: {
      staleTokenCancelled: true,
      waitCancelledBeforeSecondPoll: true,
      disposedDidNotOpenFile: true,
      activeRevealSucceeded: true,
      componentWiring: true,
    },
  }, null, 2))
} finally {
  await vite.close()
}
