import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { createPinia, setActivePinia } from 'pinia'
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
        if (rendered.includes('WebSocket server error:')) {
          return
        }
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
  mockIPC((cmd) => {
    if (cmd === 'extension_host_respond_ui_request') {
      return { accepted: true }
    }
    throw new Error(`Unexpected IPC command: ${cmd}`)
  }, { shouldMockEvents: true })

  const { useExtensionWindowUiStore } = await vite.ssrLoadModule('/src/stores/extensionWindowUi.js')
  const promptState = await vite.ssrLoadModule('/src/domains/extensions/extensionWindowPromptState.js')
  const pinia = createPinia()
  setActivePinia(pinia)

  const extensionWindowUi = useExtensionWindowUiStore(pinia)
  extensionWindowUi.presentRequest({
    requestId: 'request-quickpick-multi',
    extensionId: 'example-quickpick-extension',
    workspaceRoot: '/tmp/workspace',
    kind: 'quickPick',
    title: 'Pick many',
    canPickMany: true,
    items: [
      { id: 'alpha', label: 'Alpha', value: { id: 'alpha' }, picked: true },
      { id: 'beta', label: 'Beta', value: { id: 'beta' }, picked: false },
      { id: 'gamma', label: 'Gamma', value: { id: 'gamma' }, picked: true },
    ],
  })

  const seeded = promptState.seedQuickPickSelection(extensionWindowUi.pendingRequest.items)
  assert.deepEqual(seeded, ['alpha', 'gamma'])

  const selected = promptState.toggleQuickPickSelection(seeded, 'beta')
  const submission = promptState.resolveQuickPickSubmission({
    requestItems: extensionWindowUi.pendingRequest.items,
    filteredItems: extensionWindowUi.pendingRequest.items,
    activeIndex: 0,
    selectedItemIds: selected,
    canPickMany: true,
  })

  assert.deepEqual(submission, [{ id: 'alpha' }, { id: 'beta' }, { id: 'gamma' }])

  await extensionWindowUi.resolve(submission)

  assert.equal(extensionWindowUi.visible, false)
  assert.equal(extensionWindowUi.pendingRequest, null)

  console.log(JSON.stringify({
    ok: true,
    seeded,
    selected,
    submittedCount: submission.length,
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
}
