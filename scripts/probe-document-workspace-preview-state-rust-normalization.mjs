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

    if (cmd === 'document_workspace_preview_state_resolve') {
      return {
        useWorkspace: true,
        previewKind: 'pdf',
        rawPath: args?.params?.path,
        rawPreviewRequested: args?.params?.previewRequested,
        rawState: args?.params?.state,
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { resolveDocumentWorkspacePreviewState } = await vite.ssrLoadModule(
    '/src/services/documentWorkflow/workspacePreviewStateBridge.ts',
  )

  const rawParams = {
    path: 42,
    sourcePath: false,
    workflowKind: ['latex'],
    previewKind: 'pdf',
    workspacePreviewRequest: null,
    resolvedTargetPath: ['/tmp/main.pdf'],
    artifactPath: false,
    hiddenByUser: 'yes',
    previewRequested: 'true',
    state: 'raw-state-for-rust',
  }

  const previewState = await resolveDocumentWorkspacePreviewState(rawParams)

  assert.deepEqual(calls.map((call) => call.cmd), ['document_workspace_preview_state_resolve'])
  assert.deepEqual(calls[0].args.params, rawParams)
  assert.equal(previewState.rawPath, rawParams.path)
  assert.equal(previewState.rawPreviewRequested, rawParams.previewRequested)
  assert.equal(previewState.rawState, rawParams.state)

  console.log('document workspace preview state rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
