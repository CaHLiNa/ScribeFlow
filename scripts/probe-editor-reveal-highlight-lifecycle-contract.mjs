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

function createEditorView() {
  const calls = {
    dispatch: [],
    focus: 0,
  }
  return {
    calls,
    state: {
      doc: {
        length: 24,
        lines: 3,
        line(number) {
          return { number, from: (number - 1) * 8 }
        },
        lineAt(pos) {
          return {
            number: Math.floor(pos / 8) + 1,
            from: Math.floor(pos / 8) * 8,
          }
        },
      },
    },
    dispatch(payload) {
      calls.dispatch.push(payload)
    },
    focus() {
      calls.focus += 1
    },
  }
}

try {
  const {
    cancelRevealHighlight,
    createRevealHighlightExtension,
    focusEditorRangeWithHighlight,
  } = await vite.ssrLoadModule('/src/editor/revealHighlight.js')

  const cancelScheduler = createManualScheduler()
  const cancelView = createEditorView()
  assert.equal(
    focusEditorRangeWithHighlight(cancelView, 10, 12, { scheduler: cancelScheduler }),
    true
  )
  assert.equal(cancelScheduler.pendingCount(), 1)
  assert.equal(cancelRevealHighlight(cancelView), true)
  assert.equal(cancelScheduler.pendingCount(), 0)
  assert.equal(cancelScheduler.flush(), false)
  assert.equal(cancelView.calls.dispatch.length, 1)

  const supersedeScheduler = createManualScheduler()
  const supersedeView = createEditorView()
  assert.equal(
    focusEditorRangeWithHighlight(supersedeView, 3, 3, { scheduler: supersedeScheduler }),
    true
  )
  assert.equal(
    focusEditorRangeWithHighlight(supersedeView, 11, 11, { scheduler: supersedeScheduler }),
    true
  )
  assert.equal(supersedeScheduler.pendingCount(), 1)
  assert.deepEqual(supersedeScheduler.cancelled, [1])
  assert.equal(supersedeScheduler.flush(), true)
  assert.equal(supersedeView.calls.dispatch.length, 3)

  const clearDecorationsScheduler = createManualScheduler()
  const clearDecorationsView = createEditorView()
  assert.equal(
    focusEditorRangeWithHighlight(clearDecorationsView, 4, 4, {
      scheduler: clearDecorationsScheduler,
    }),
    true
  )
  assert.equal(cancelRevealHighlight(clearDecorationsView, { clearDecorations: true }), true)
  assert.equal(clearDecorationsView.calls.dispatch.length, 2)

  const extension = createRevealHighlightExtension()
  const plugin = extension.find((entry) =>
    entry?.constructor?.name === 'ViewPlugin' && typeof entry?.create === 'function'
  )
  assert.ok(plugin, 'reveal highlight extension must install destroy cleanup plugin')

  const destroyScheduler = createManualScheduler()
  const destroyView = createEditorView()
  assert.equal(
    focusEditorRangeWithHighlight(destroyView, 6, 6, { scheduler: destroyScheduler }),
    true
  )
  plugin.create(destroyView).destroy()
  assert.equal(destroyScheduler.pendingCount(), 0)
  assert.equal(destroyScheduler.flush(), false)
  assert.equal(destroyView.calls.dispatch.length, 1)

  const componentSource = await readFile('src/components/editor/TextEditor.vue', 'utf8')
  assert.match(
    componentSource,
    /import \{ cancelRevealHighlight, createRevealHighlightExtension \} from '..\/..\/editor\/revealHighlight'/,
    'TextEditor must import reveal highlight cancellation'
  )
  assert.match(
    componentSource,
    /function deactivateEditorRuntime\(\)[\s\S]*cancelRevealHighlight\(view,\s*\{\s*clearDecorations:\s*true\s*\}\)[\s\S]*markdownSyncTiming\.cancelAll\(\)/,
    'TextEditor must cancel pending reveal-highlight timers and clear decorations during runtime deactivation'
  )

  console.log(JSON.stringify({
    ok: true,
    summary: {
      cancelStopsPendingClear: true,
      supersedeCancelsOlderTimer: true,
      optionalDecorationClear: true,
      viewDestroyCancelsPendingClear: true,
      componentWiring: true,
    },
  }, null, 2))
} finally {
  await vite.close()
}
