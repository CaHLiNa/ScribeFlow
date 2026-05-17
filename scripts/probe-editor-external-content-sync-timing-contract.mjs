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

function createTextDoc(text) {
  return {
    get length() {
      return text.length
    },
    toString() {
      return text
    },
  }
}

function applyChange(text, change = {}) {
  return `${text.slice(0, change.from)}${change.insert || ''}${text.slice(change.to)}`
}

function createFakeView(initialText = '') {
  const dispatches = []
  return {
    dispatches,
    state: {
      doc: createTextDoc(initialText),
    },
    setText(text) {
      this.state.doc = createTextDoc(text)
    },
    dispatch(payload = {}) {
      dispatches.push(payload)
      if (payload.changes) {
        this.setText(applyChange(this.state.doc.toString(), payload.changes))
      }
    },
  }
}

function deferredChange(change) {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return {
    promise,
    resolve: () => resolve(change),
  }
}

try {
  const {
    createExternalContentSyncController,
  } = await vite.ssrLoadModule('/src/composables/useTextEditorBridges.js')

  let storeContent = 'hello external'
  const staleView = createFakeView('hello local')
  const staleDiff = deferredChange({ from: 6, to: 11, insert: 'external' })
  const staleController = createExternalContentSyncController({
    getView: () => staleView,
    getCurrentFileContent: () => storeContent,
    computeChange: async () => staleDiff.promise,
  })

  const staleSync = staleController.syncExternalContent(storeContent)
  staleView.setText('hello user typing')
  staleDiff.resolve()
  assert.equal(await staleSync, false)
  assert.equal(staleView.dispatches.length, 0)
  assert.equal(staleView.state.doc.toString(), 'hello user typing')

  const invalidatedView = createFakeView('alpha')
  const invalidatedDiff = deferredChange({ from: 0, to: 5, insert: 'beta' })
  const invalidatedController = createExternalContentSyncController({
    getView: () => invalidatedView,
    getCurrentFileContent: () => 'beta',
    computeChange: async () => invalidatedDiff.promise,
  })

  const invalidatedSync = invalidatedController.syncExternalContent('beta')
  invalidatedController.invalidatePendingSync()
  invalidatedDiff.resolve()
  assert.equal(await invalidatedSync, false)
  assert.equal(invalidatedView.dispatches.length, 0)
  assert.equal(invalidatedView.state.doc.toString(), 'alpha')

  const currentView = createFakeView('one')
  const currentController = createExternalContentSyncController({
    getView: () => currentView,
    getCurrentFileContent: () => 'two',
    computeChange: async () => ({ from: 0, to: 3, insert: 'two' }),
  })

  assert.equal(await currentController.syncExternalContent('two'), true)
  assert.equal(currentView.dispatches.length, 1)
  assert.equal(currentView.state.doc.toString(), 'two')

  console.log(JSON.stringify({
    ok: true,
    summary: {
      staleDispatches: staleView.dispatches.length,
      invalidatedDispatches: invalidatedView.dispatches.length,
      currentDispatches: currentView.dispatches.length,
      currentText: currentView.state.doc.toString(),
    },
  }, null, 2))
} finally {
  await vite.close()
}
