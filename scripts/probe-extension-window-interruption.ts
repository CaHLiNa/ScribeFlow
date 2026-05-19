import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { createPinia, setActivePinia } from 'pinia'
import { createLogger, createServer } from 'vite'
import { emit } from '@tauri-apps/api/event'

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
        if (rendered.includes('WebSocket server error:')) {
          return
        }
        console.error(message, ...rest)
      },
    },
  }),
})

let clearTauriMocks = () => {}
let stopInterruptedListener = null

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')
  mockIPC(() => null, { shouldMockEvents: true })

  const { useExtensionWindowUiStore } = await vite.ssrLoadModule('/src/stores/extensionWindowUi.ts')
  const { listenExtensionHostInterrupted } = await vite.ssrLoadModule('/src/services/extensions/extensionHostEvents.ts')

  const pinia = createPinia()
  setActivePinia(pinia)
  const extensionWindowUi = useExtensionWindowUiStore(pinia)

  stopInterruptedListener = await listenExtensionHostInterrupted((event) => {
    const payload = event?.payload || {}
    const requestId = String(payload.requestId || '')
    if (requestId && extensionWindowUi.pendingRequest?.requestId === requestId) {
      extensionWindowUi.clearRequest()
    }
  })

  extensionWindowUi.presentRequest({
    requestId: 'request-ui-interrupt',
    extensionId: 'example-ui-interrupt-extension',
    workspaceRoot: '/tmp/workspace',
    kind: 'inputBox',
    title: 'Recovery prompt',
    prompt: 'This prompt should be interrupted',
    placeholder: 'Type here',
    value: 'seed',
  })

  assert.equal(extensionWindowUi.visible, true)
  assert.equal(extensionWindowUi.pendingRequest?.requestId, 'request-ui-interrupt')

  await emit('extension-host-interrupted', {
    requestId: 'request-ui-interrupt',
    kind: 'windowInput',
    message: 'Extension host stopped while waiting for UI request completion: request-ui-interrupt',
  })

  assert.equal(extensionWindowUi.visible, false)
  assert.equal(extensionWindowUi.pendingRequest, null)
  assert.equal(extensionWindowUi.busy, false)

  console.log(JSON.stringify({
    ok: true,
    clearedInterruptedPrompt: true,
  }, null, 2))
} finally {
  await stopInterruptedListener?.()
  clearTauriMocks()
  await vite.close()
}
