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

    if (cmd === 'extension_host_respond_ui_request') {
      return { requestId: 'request-1', accepted: true }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    respondExtensionWindowUiRequest,
  } = await vite.ssrLoadModule('/src/services/extensions/extensionWindowUi.ts')

  await respondExtensionWindowUiRequest({
    requestId: 42,
    cancelled: 'true',
    result: {
      selected: 'alpha',
    },
  })
  await respondExtensionWindowUiRequest({
    request_id: ' request-2 ',
    cancelled: true,
    result: ['alpha', 'beta'],
  })
  await respondExtensionWindowUiRequest(false)

  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'extension_host_respond_ui_request',
      'extension_host_respond_ui_request',
      'extension_host_respond_ui_request',
    ],
  )
  assert.deepEqual(calls[0].args, {
    params: {
      requestId: 42,
      cancelled: 'true',
      result: {
        selected: 'alpha',
      },
    },
  })
  assert.deepEqual(calls[1].args, {
    params: {
      request_id: ' request-2 ',
      cancelled: true,
      result: ['alpha', 'beta'],
    },
  })
  assert.deepEqual(calls[2].args, {
    params: false,
  })

  console.log('extension window ui rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
