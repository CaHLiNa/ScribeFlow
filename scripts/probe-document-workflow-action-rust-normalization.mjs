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

    if (cmd === 'document_workflow_action_resolve') {
      return {
        actionType: 'run-build',
        rawFilePath: args?.params?.filePath,
        rawIntent: args?.params?.intent,
        rawUiState: args?.params?.uiState,
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { resolveDocumentWorkflowAction } = await vite.ssrLoadModule(
    '/src/services/documentWorkflow/actionRuntimeBridge.js',
  )

  const rawParams = {
    filePath: 42,
    intent: false,
    uiState: 'raw-ui-state-for-rust',
    previewState: ['raw-preview-state-for-rust'],
    artifactPath: ['/tmp/out.pdf'],
  }

  const plan = await resolveDocumentWorkflowAction(rawParams)

  assert.deepEqual(calls.map((call) => call.cmd), ['document_workflow_action_resolve'])
  assert.deepEqual(calls[0].args.params, rawParams)
  assert.equal(plan.rawFilePath, rawParams.filePath)
  assert.equal(plan.rawIntent, rawParams.intent)
  assert.equal(plan.rawUiState, rawParams.uiState)

  console.log('document workflow action rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
