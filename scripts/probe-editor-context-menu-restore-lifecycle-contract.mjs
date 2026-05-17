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
    requestAnimationFrame(callback) {
      const id = nextId++
      pending.set(id, { callback, kind: 'frame' })
      return id
    },
    cancelAnimationFrame(id) {
      cancelled.push(id)
      pending.delete(id)
    },
    setTimeout(callback, delay) {
      const id = nextId++
      pending.set(id, { callback, delay, kind: 'timeout' })
      return id
    },
    clearTimeout(id) {
      cancelled.push(id)
      pending.delete(id)
    },
    flushNext(kind = '') {
      const entry = [...pending.entries()].find(([, value]) => !kind || value.kind === kind)
      if (!entry) return false
      const [id, value] = entry
      pending.delete(id)
      value.callback(Date.now())
      return true
    },
    pendingKinds() {
      return [...pending.values()].map((entry) => entry.kind)
    },
  }
}

try {
  const { createEditorContextMenuRestoreController } =
    await vite.ssrLoadModule('/src/editor/contextMenuRestoreTiming.js')

  const supersedeScheduler = createManualScheduler()
  const supersedeController = createEditorContextMenuRestoreController({
    scheduler: supersedeScheduler,
  })
  const restores = []

  const firstToken = supersedeController.scheduleRestore(() => {
    restores.push('first')
  })
  const secondToken = supersedeController.scheduleRestore(() => {
    restores.push('second')
  })

  assert.equal(supersedeController.isCurrent(firstToken), false)
  assert.equal(supersedeController.isCurrent(secondToken), true)
  assert.equal(supersedeScheduler.flushNext('frame'), true)
  assert.deepEqual(restores, ['second'])
  assert.deepEqual(supersedeScheduler.pendingKinds(), ['timeout'])
  assert.equal(supersedeScheduler.flushNext('timeout'), true)
  assert.deepEqual(restores, ['second', 'second'])

  const cancelBeforeFrameScheduler = createManualScheduler()
  const cancelBeforeFrameController = createEditorContextMenuRestoreController({
    scheduler: cancelBeforeFrameScheduler,
  })
  const cancelBeforeFrameRestores = []
  const cancelBeforeFrameToken = cancelBeforeFrameController.scheduleRestore(() => {
    cancelBeforeFrameRestores.push('cancelled-before-frame')
  })
  cancelBeforeFrameController.cancelPending()
  assert.equal(cancelBeforeFrameController.isCurrent(cancelBeforeFrameToken), false)
  assert.equal(cancelBeforeFrameScheduler.flushNext('frame'), false)
  assert.deepEqual(cancelBeforeFrameRestores, [])

  const cancelBeforeTimeoutScheduler = createManualScheduler()
  const cancelBeforeTimeoutController = createEditorContextMenuRestoreController({
    scheduler: cancelBeforeTimeoutScheduler,
  })
  const cancelBeforeTimeoutRestores = []
  const cancelBeforeTimeoutToken = cancelBeforeTimeoutController.scheduleRestore(() => {
    cancelBeforeTimeoutRestores.push('restore')
  })
  assert.equal(cancelBeforeTimeoutScheduler.flushNext('frame'), true)
  assert.deepEqual(cancelBeforeTimeoutRestores, ['restore'])
  cancelBeforeTimeoutController.cancelPending()
  assert.equal(cancelBeforeTimeoutController.isCurrent(cancelBeforeTimeoutToken), false)
  assert.equal(cancelBeforeTimeoutScheduler.flushNext('timeout'), false)
  assert.deepEqual(cancelBeforeTimeoutRestores, ['restore'])

  const disposedScheduler = createManualScheduler()
  const disposedController = createEditorContextMenuRestoreController({
    scheduler: disposedScheduler,
  })
  const disposedToken = disposedController.scheduleRestore(() => {
    throw new Error('disposed restore callback should not run')
  })
  disposedController.dispose()
  assert.equal(disposedController.isCurrent(disposedToken), false)
  assert.equal(disposedScheduler.flushNext('frame'), false)
  assert.equal(disposedController.scheduleRestore(() => {}), null)

  const componentSource = await readFile('src/components/editor/TextEditor.vue', 'utf8')
  assert.match(
    componentSource,
    /createEditorContextMenuRestoreController\(\)/,
    'TextEditor must create a context-menu restore timing controller'
  )
  assert.match(
    componentSource,
    /function clearContextMenuRestoreHandles\(\)[\s\S]*contextMenuRestoreTiming\.cancelPending\(\)/,
    'TextEditor clear helper must cancel the context-menu restore controller'
  )
  assert.match(
    componentSource,
    /function restoreContextMenuSelection\(selection\)[\s\S]*!editorRuntimeActive[\s\S]*view\.dispatch\(\{ selection \}\)/,
    'selection restore must not dispatch after runtime deactivation'
  )
  assert.match(
    componentSource,
    /function scheduleContextMenuSelectionRestore\(selection\)[\s\S]*clearContextMenuRestoreHandles\(\)[\s\S]*contextMenuRestoreTiming\.scheduleRestore/,
    'each selection restore schedule must supersede older pending restore work'
  )
  assert.match(
    componentSource,
    /function handleContextMenuMouseDown\(event\)[\s\S]*clearContextMenuRestoreHandles\(\)/,
    'fresh mouse gestures must cancel stale context-menu restore work'
  )
  assert.match(
    componentSource,
    /function closeContextMenu\(\)[\s\S]*clearContextMenuRestoreHandles\(\)/,
    'closing the menu must cancel stale context-menu restore work'
  )
  assert.match(
    componentSource,
    /contextMenuRestoreTiming\.dispose\(\)/,
    'unmount cleanup must dispose context-menu restore timing'
  )

  console.log(JSON.stringify({
    ok: true,
    summary: {
      supersededRestoreCancelled: true,
      cancelBeforeFramePreventsDispatch: true,
      cancelBeforeTimeoutPreventsSecondDispatch: true,
      disposedRestoreCancelled: true,
      componentWiring: true,
    },
  }, null, 2))
} finally {
  await vite.close()
}
