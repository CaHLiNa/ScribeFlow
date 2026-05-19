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

  let promptOpen = false
  let currentPromptOwner = null
  const ipcCalls = []
  mockIPC((cmd, args) => {
    ipcCalls.push([cmd, args])
    if (cmd === 'extension_host_status') {
      return {
        available: true,
        runtime: 'node-extension-host-persistent',
        activatedExtensions: ['example-pdf-extension', 'example-pdf-extension'],
        activeRuntimeSlots: [
          {
            extensionId: 'example-pdf-extension',
            workspaceRoot: '/tmp/workspace-a',
          },
          {
            extensionId: 'example-pdf-extension',
            workspaceRoot: '/tmp/workspace-b',
          },
        ],
        pendingPromptOwner: promptOpen ? currentPromptOwner : null,
      }
    }
    if (cmd === 'extension_host_respond_ui_request') {
      promptOpen = false
      currentPromptOwner = null
      return {
        requestId: String(args?.params?.requestId || ''),
        accepted: true,
      }
    }
    if (cmd === 'extension_task_list') return []
    throw new Error(`Unexpected IPC command: ${cmd}`)
  }, { shouldMockEvents: true })

  const { useExtensionsStore } = await vite.ssrLoadModule('/src/stores/extensions.ts')
  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.ts')
  const { useExtensionWindowUiStore } = await vite.ssrLoadModule('/src/stores/extensionWindowUi.ts')

  const pinia = createPinia()
  setActivePinia(pinia)

  const workspace = useWorkspaceStore(pinia)
  workspace.path = '/tmp/workspace-a'

  const extensions = useExtensionsStore(pinia)
  const extensionWindowUi = useExtensionWindowUiStore(pinia)
  const summary = await extensions.refreshHostSummary()

  assert.equal(summary.runtime, 'node-extension-host-persistent')
  assert.deepEqual(
    summary.activeRuntimeSlots.map((entry) => entry.workspaceRoot),
    ['/tmp/workspace-a', '/tmp/workspace-b'],
  )
  assert.equal(summary.pendingPromptOwner, null)

  promptOpen = true
  currentPromptOwner = {
    extensionId: 'example-pdf-extension',
    workspaceRoot: '/tmp/workspace-b',
  }
  extensionWindowUi.presentRequest({
    requestId: 'request-pending-prompt',
    extensionId: 'example-pdf-extension',
    workspaceRoot: '/tmp/workspace-b',
    kind: 'inputBox',
    title: 'Pending prompt',
    prompt: 'Waiting for input',
    placeholder: 'Type here',
  })

  const pendingSummary = await extensions.syncHostSummaryAfterPromptEvent()
  assert.equal(pendingSummary.pendingPromptOwner?.extensionId, 'example-pdf-extension')
  assert.equal(pendingSummary.pendingPromptOwner?.workspaceRoot, '/tmp/workspace-b')

  await extensionWindowUi.resolve('confirmed')
  const recoveredSummary = await extensions.syncHostSummaryAfterPromptEvent()
  assert.equal(recoveredSummary.pendingPromptOwner, null)

  promptOpen = true
  currentPromptOwner = {
    extensionId: 'example-pdf-extension',
    workspaceRoot: '/tmp/workspace-a',
  }
  extensionWindowUi.presentRequest({
    requestId: 'request-pending-prompt-cancelled-from-store',
    extensionId: 'example-pdf-extension',
    workspaceRoot: '/tmp/workspace-a',
    kind: 'inputBox',
    title: 'Pending prompt',
    prompt: 'Waiting for input',
    placeholder: 'Type here',
  })
  await extensions.syncHostSummaryAfterPromptEvent()
  const cancelledSummary = await extensions.cancelPendingPromptForExtension('example-pdf-extension', '/tmp/workspace-a')
  assert.equal(cancelledSummary.pendingPromptOwner, null)
  assert.equal(extensionWindowUi.visible, false)

  const diagnostics = extensions.hostDiagnosticsFor('example-pdf-extension', '/tmp/workspace-a')
  assert.equal(diagnostics.activeWorkspaceSlotCount, 1)
  assert.equal(diagnostics.otherWorkspaceSlotCount, 1)
  assert.equal(diagnostics.ownsPendingPrompt, false)
  assert.equal(diagnostics.blockedByForeignPrompt, false)

  promptOpen = true
  currentPromptOwner = {
    extensionId: 'another-extension',
    workspaceRoot: '/tmp/workspace-b',
  }
  extensionWindowUi.presentRequest({
    requestId: 'request-foreign-blocking-prompt',
    extensionId: 'another-extension',
    workspaceRoot: '/tmp/workspace-b',
    kind: 'inputBox',
    title: 'Blocking prompt',
    prompt: 'Foreign extension owns the prompt',
    placeholder: 'Type here',
  })
  const foreignPendingSummary = await extensions.syncHostSummaryAfterPromptEvent()
  assert.equal(foreignPendingSummary.pendingPromptOwner?.extensionId, 'another-extension')
  assert.equal(foreignPendingSummary.pendingPromptOwner?.workspaceRoot, '/tmp/workspace-b')
  const foreignDiagnostics = extensions.hostDiagnosticsFor('example-pdf-extension', '/tmp/workspace-a')
  assert.equal(foreignDiagnostics.blockedByForeignPrompt, true)
  assert.equal(foreignDiagnostics.pendingPromptOwner?.extensionId, 'another-extension')
  const foreignCancelledSummary = await extensions.cancelPendingPromptForExtension('another-extension', '/tmp/workspace-b')
  assert.equal(foreignCancelledSummary.pendingPromptOwner, null)

  console.log(JSON.stringify({
    ok: true,
    summary: {
      runtime: summary.runtime,
      activeRuntimeSlotCount: summary.activeRuntimeSlots.length,
      activeRuntimeSlotRoots: summary.activeRuntimeSlots.map((entry) => entry.workspaceRoot),
      pendingPromptOwnerWhilePromptOpen: pendingSummary.pendingPromptOwner,
      pendingPromptOwnerAfterResolve: recoveredSummary.pendingPromptOwner,
      pendingPromptOwnerAfterStoreCancel: cancelledSummary.pendingPromptOwner,
      foreignBlockedPromptOwner: foreignPendingSummary.pendingPromptOwner,
      foreignBlockedPromptCleared: foreignCancelledSummary.pendingPromptOwner,
      activeWorkspaceSlotCount: diagnostics.activeWorkspaceSlotCount,
      otherWorkspaceSlotCount: diagnostics.otherWorkspaceSlotCount,
      respondRequestObserved: ipcCalls.some(([cmd]) => cmd === 'extension_host_respond_ui_request'),
    },
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
}
