import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createLogger, createServer } from 'vite'

if (!globalThis.window) {
  globalThis.window = globalThis
}

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
    findPaneWithTab: 0,
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
        lineAt() {
          return { from: 0 }
        },
        sliceString() {
          return ''
        },
      },
    },
    dispatch() {
      calls.dispatch = (calls.dispatch || 0) + 1
    },
    focus() {
      calls.focus = (calls.focus || 0) + 1
    },
  }

  return {
    calls,
    activePaneId: 'pane-a',
    paneTree: {},
    findPane() {
      calls.findPane += 1
      return null
    },
    findPaneWithTab() {
      calls.findPaneWithTab += 1
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
  const { createLatexRevealLifecycle } =
    await vite.ssrLoadModule('/src/editor/latexRevealTiming.ts')
  const {
    revealLatexSourceLocation,
    waitForLatexEditorViewWithLifecycle,
  } = await vite.ssrLoadModule('/src/services/latex/previewSync.ts')

  const firstScheduler = createManualScheduler()
  const firstLifecycle = createLatexRevealLifecycle({ scheduler: firstScheduler })
  const firstToken = firstLifecycle.begin()
  const secondToken = firstLifecycle.begin()
  assert.equal(firstLifecycle.isCancelled(firstToken), true)
  assert.equal(firstLifecycle.isCurrent(secondToken), true)

  const waitingStore = createEditorStore({ viewAppearsAfterPolls: 99 })
  const waitingPromise = waitForLatexEditorViewWithLifecycle(waitingStore, '/tmp/a.tex', {
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
  const disposedLifecycle = createLatexRevealLifecycle()
  const disposedToken = disposedLifecycle.begin()
  disposedLifecycle.dispose()
  const disposedResult = await revealLatexSourceLocation(disposedStore, {
    filePath: '/tmp/disposed.tex',
    line: 1,
  }, {
    lifecycle: disposedLifecycle,
    token: disposedToken,
  })
  assert.equal(disposedResult, false)
  assert.equal(disposedStore.calls.openFile, 0)

  const activeStore = createEditorStore({ viewAppearsAfterPolls: 0 })
  const activeLifecycle = createLatexRevealLifecycle()
  const activeToken = activeLifecycle.begin()
  const activeResult = await revealLatexSourceLocation(activeStore, {
    filePath: '/tmp/active.tex',
    line: 1,
  }, {
    lifecycle: activeLifecycle,
    token: activeToken,
  })
  assert.equal(activeResult, true)
  assert.equal(activeStore.calls.openFile, 1)
  assert.equal(activeStore.calls.dispatch, 1)

  const textEditorSource = await readFile('src/components/editor/TextEditor.vue', 'utf8')
  assert.match(
    textEditorSource,
    /createLatexRevealLifecycle\(\)/,
    'TextEditor must create a LaTeX reveal lifecycle controller'
  )
  assert.match(
    textEditorSource,
    /latexRevealLifecycle\.begin\(\)/,
    'TextEditor must version each PDF-to-source reveal event'
  )
  assert.match(
    textEditorSource,
    /lifecycle:\s*latexRevealLifecycle[\s\S]*token,/,
    'TextEditor must pass reveal lifecycle tokens into the LaTeX reveal service'
  )
  assert.match(
    textEditorSource,
    /latexRevealLifecycle\.cancelPending\(\)/,
    'TextEditor must invalidate pending source reveals when editor runtime deactivates'
  )
  assert.match(
    textEditorSource,
    /latexRevealLifecycle\.dispose\(\)/,
    'TextEditor must invalidate pending source reveals on unmount'
  )

  const pdfSurfaceSource = await readFile('src/components/editor/PdfEmbedSurface.vue', 'utf8')
  assert.match(
    pdfSurfaceSource,
    /createLatexRevealLifecycle\(\)/,
    'PdfEmbedSurface must create a reverse-sync lifecycle controller'
  )
  assert.match(
    pdfSurfaceSource,
    /latexRevealLifecycle\.begin\(\)/,
    'PdfEmbedSurface must version each reverse-sync request'
  )
  assert.match(
    pdfSurfaceSource,
    /latexRevealLifecycle\.isCancelled\(token\)/,
    'PdfEmbedSurface must cancel stale reverse-sync requests before emitting source reveals'
  )
  assert.match(
    pdfSurfaceSource,
    /latexRevealLifecycle\.cancelPending\(\)/,
    'PdfEmbedSurface must invalidate pending reverse-sync work when the preview revision changes'
  )
  assert.match(
    pdfSurfaceSource,
    /latexRevealLifecycle\.dispose\(\)/,
    'PdfEmbedSurface must invalidate pending reverse-sync work on unmount'
  )

  console.log(JSON.stringify({
    ok: true,
    summary: {
      staleTokenCancelled: true,
      waitCancelledBeforeSecondPoll: true,
      disposedDidNotOpenFile: true,
      activeRevealSucceeded: true,
      textEditorWiring: true,
      pdfSurfaceWiring: true,
    },
  }, null, 2))
} finally {
  await vite.close()
}
