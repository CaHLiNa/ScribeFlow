import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { createLogger, createServer } from 'vite'

if (!globalThis.window) {
  globalThis.window = globalThis
}

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto
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

let clearTauriMocks = () => {}

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'document_workflow_controller_execute') {
      return {
        result: {
          rawOperation: args?.params?.operation,
          rawActiveFile: args?.params?.activeFile,
          rawPreviewBindings: args?.params?.previewBindings,
          rawSession: args?.params?.session,
          rawReconcileAfterClose: args?.params?.reconcileAfterClose,
        },
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { executeDocumentWorkflowController } = await vite.ssrLoadModule(
    '/src/services/documentWorkflow/controllerBridge.js',
  )

  const rawParams = {
    operation: false,
    activeFile: 42,
    activePaneId: ['pane-a'],
    trigger: null,
    previewPrefs: 'raw-preview-prefs-for-rust',
    previewBindings: 'raw-preview-bindings-for-rust',
    session: 'raw-session-for-rust',
    force: 'yes',
    previewKindOverride: ['html'],
    sourcePath: 17,
    previewKind: false,
    sourcePaneId: null,
    activatePreview: 'true',
    reconcileAfterClose: 'no',
  }

  const plan = await executeDocumentWorkflowController(rawParams)

  assert.deepEqual(calls.map((call) => call.cmd), ['document_workflow_controller_execute'])
  assert.deepEqual(calls[0].args.params, rawParams)
  assert.equal(plan.result.rawOperation, rawParams.operation)
  assert.equal(plan.result.rawActiveFile, rawParams.activeFile)
  assert.equal(plan.result.rawPreviewBindings, rawParams.previewBindings)
  assert.equal(plan.result.rawSession, rawParams.session)
  assert.equal(plan.result.rawReconcileAfterClose, rawParams.reconcileAfterClose)

  console.log('document workflow controller rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
