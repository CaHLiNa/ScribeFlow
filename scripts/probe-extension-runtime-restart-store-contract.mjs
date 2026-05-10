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

  let activationCount = 0
  let runtimeActive = true
  const ipcCalls = []
  mockIPC((cmd, args) => {
    ipcCalls.push([cmd, args])
    if (cmd === 'extension_host_status') {
      return {
        available: true,
        runtime: 'node-extension-host-persistent',
        activatedExtensions: runtimeActive ? ['example-pdf-extension'] : [],
        activeRuntimeSlots: runtimeActive
          ? [{
            extensionId: 'example-pdf-extension',
            workspaceRoot: '/tmp/workspace',
          }]
          : [],
        pendingPromptOwner: null,
      }
    }
    if (cmd === 'extension_host_deactivate') {
      runtimeActive = false
      return {
        extensionId: String(args?.params?.extensionId || ''),
        accepted: true,
      }
    }
    if (cmd === 'extension_host_activate') {
      runtimeActive = true
      activationCount += 1
      return {
        activated: true,
        reason: `activation-${activationCount}`,
        registeredCommands: ['examplePdfExtension.refreshTranslateView'],
        registeredCapabilities: [],
        registeredViews: ['examplePdfExtension.translateView'],
        registeredCommandDetails: [],
        registeredMenuActions: [],
        registeredViewDetails: [],
      }
    }
    if (cmd === 'extension_task_list') return []
    throw new Error(`Unexpected IPC command: ${cmd}`)
  }, { shouldMockEvents: true })

  const { useExtensionsStore } = await vite.ssrLoadModule('/src/stores/extensions.js')
  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.js')

  const pinia = createPinia()
  setActivePinia(pinia)

  const workspace = useWorkspaceStore(pinia)
  workspace.path = '/tmp/workspace'
  workspace.globalConfigDir = '/tmp/global-config'
  workspace.ensureGlobalConfigDir = async () => '/tmp/global-config'

  const extensions = useExtensionsStore(pinia)
  extensions.enabledExtensionIds = ['example-pdf-extension']
  extensions.registry = [{
    id: 'example-pdf-extension',
    name: 'Example PDF Extension',
    status: 'available',
    contributedCommands: [],
    contributedMenus: [],
    contributedKeybindings: [],
    contributedViewContainers: [],
    contributedViews: [],
    contributedViewTitleMenus: [],
    contributedViewItemMenus: [],
    contributedCapabilities: [],
    capabilities: [],
    settingsSchema: {},
    warnings: [],
    errors: [],
  }]
  extensions.runtimeRegistry['example-pdf-extension'] = {
    activated: true,
    reason: 'activation-0',
    registeredCommands: ['examplePdfExtension.refreshTranslateView'],
    registeredCapabilities: [],
    registeredViews: ['examplePdfExtension.translateView'],
    registeredCommandDetails: [],
    registeredMenuActions: [],
    registeredViewDetails: [],
  }

  const beforeSummary = await extensions.refreshHostSummary()
  assert.equal(beforeSummary.activeRuntimeSlots.length, 1)

  const restarted = await extensions.restartExtensionRuntime('example-pdf-extension', '/tmp/workspace')
  const afterSummary = extensions.hostStatus

  assert.equal(restarted?.activated, true)
  assert.equal(restarted?.reason, 'activation-1')
  assert.equal(afterSummary.activeRuntimeSlots.length, 1)
  assert.equal(afterSummary.activeRuntimeSlots[0]?.extensionId, 'example-pdf-extension')
  assert.equal(afterSummary.activeRuntimeSlots[0]?.workspaceRoot, '/tmp/workspace')

  const deactivateCalls = ipcCalls.filter(([cmd]) => cmd === 'extension_host_deactivate')
  const activateCalls = ipcCalls.filter(([cmd]) => cmd === 'extension_host_activate')
  assert.equal(deactivateCalls.length, 1)
  assert.equal(activateCalls.length, 1)

  console.log(JSON.stringify({
    ok: true,
    summary: {
      beforeActiveSlotCount: beforeSummary.activeRuntimeSlots.length,
      afterActiveSlotCount: afterSummary.activeRuntimeSlots.length,
      restartReason: restarted?.reason || '',
      deactivateCallCount: deactivateCalls.length,
      activateCallCount: activateCalls.length,
    },
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
}
