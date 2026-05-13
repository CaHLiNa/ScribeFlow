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

    if (cmd === 'document_workflow_workspace_preview_apply') {
      return {
        state: {},
        result: {
          rawState: args?.params?.state,
          rawIntent: args?.params?.intent,
          rawFilePath: args?.params?.filePath,
          rawPersistPreference: args?.params?.persistPreference,
        },
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { applyDocumentWorkspacePreviewState } = await vite.ssrLoadModule(
    '/src/services/documentWorkflow/workspacePreviewBridge.js',
  )

  const rawParams = {
    state: 'raw-state-for-rust',
    intent: false,
    filePath: 42,
    kind: ['markdown'],
    previewKind: 'html',
    preferredPreviewKind: null,
    persistPreference: 'no',
    sourcePaneId: ['/tmp/source-pane'],
  }

  const mutation = await applyDocumentWorkspacePreviewState(rawParams)

  assert.deepEqual(calls.map((call) => call.cmd), ['document_workflow_workspace_preview_apply'])
  assert.deepEqual(calls[0].args.params, rawParams)
  assert.equal(mutation.result.rawState, rawParams.state)
  assert.equal(mutation.result.rawIntent, rawParams.intent)
  assert.equal(mutation.result.rawFilePath, rawParams.filePath)
  assert.equal(mutation.result.rawPersistPreference, rawParams.persistPreference)

  console.log('document workspace preview apply rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
