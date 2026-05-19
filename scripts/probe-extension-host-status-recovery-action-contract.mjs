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

  const cancelCalls = []
  mockIPC((cmd, args) => {
    if (cmd === 'extension_host_cancel_window_inputs') {
      cancelCalls.push(args)
      return { cancelled: true }
    }
    throw new Error(`Unexpected IPC command: ${cmd}`)
  }, { shouldMockEvents: true })

  const { useExtensionsStore } = await vite.ssrLoadModule('/src/stores/extensions.ts')
  const { useToastStore } = await vite.ssrLoadModule('/src/stores/toast.ts')
  const { useExtensionHostStatusPresentation } = await vite.ssrLoadModule('/src/composables/useExtensionHostStatusPresentation.ts')

  const pinia = createPinia()
  setActivePinia(pinia)
  const extensions = useExtensionsStore(pinia)
  const toast = useToastStore(pinia)

  const source = {
    badgeKey: 'Blocked',
    titleKey: 'Extension host is waiting for prompt input',
    descriptionKey: 'A pending prompt from {extensionId} in {workspace} is blocking new top-level host requests until it is completed or cancelled.',
    descriptionParams: {
      extensionId: 'another-extension',
      workspace: '/tmp/workspace-b',
    },
    toneClass: 'is-warning',
    summaryParts: [{
      key: 'Blocked by prompt from {extensionId} in {workspace}',
      params: {
        extensionId: 'another-extension',
        workspace: '/tmp/workspace-b',
      },
    }],
    recoveryOwner: {
      extensionId: 'another-extension',
      workspaceRoot: '/tmp/workspace-b',
    },
  }

  const {
    presentation,
    recoveryAction,
    triggerRecoveryAction,
  } = useExtensionHostStatusPresentation(() => source)

  assert.equal(presentation.value.badge, 'Blocked')
  assert.equal(
    presentation.value.summaryText,
    'Blocked by prompt from another-extension in /tmp/workspace-b',
  )
  assert.equal(recoveryAction.value.available, true)
  assert.equal(recoveryAction.value.busy, false)
  assert.equal(recoveryAction.value.label, 'Cancel Prompt')
  assert.equal(
    recoveryAction.value.title,
    'Cancel the blocking prompt from another-extension in /tmp/workspace-b.',
  )

  await triggerRecoveryAction()

  assert.equal(cancelCalls.length, 1)
  assert.equal(cancelCalls[0]?.params?.extensionId, 'another-extension')
  assert.equal(cancelCalls[0]?.params?.workspaceRoot, '/tmp/workspace-b')
  assert.equal(toast.toasts.length, 1)
  assert.equal(toast.toasts[0]?.message, 'Cancelled the blocking extension prompt')

  console.log(JSON.stringify({
    ok: true,
    summary: {
      badge: presentation.value.badge,
      summaryText: presentation.value.summaryText,
      recoveryLabel: recoveryAction.value.label,
      cancelCallCount: cancelCalls.length,
      toastMessage: toast.toasts[0]?.message || '',
    },
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
}
