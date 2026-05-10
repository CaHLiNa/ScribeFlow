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

  const ipcCalls = []
  mockIPC((cmd, args) => {
    ipcCalls.push([cmd, args])
    if (cmd === 'extension_settings_save') {
      return {
        settingsExists: true,
        enabledExtensionIds: args?.params?.settings?.enabledExtensionIds || [],
        extensionConfig: args?.params?.settings?.extensionConfig || {},
      }
    }
    if (cmd === 'extension_host_activate') {
      return {
        activated: true,
        reason: 'Activated by host',
        registeredCommands: ['exampleRuntimeOnlyExtension.hiddenCommand'],
        registeredCapabilities: [],
        registeredViews: [],
        registeredCommandDetails: [
          {
            commandId: 'exampleRuntimeOnlyExtension.hiddenCommand',
            title: 'Hidden Runtime Command',
            category: 'Runtime',
            when: '',
          },
        ],
        registeredMenuActions: [
          {
            commandId: 'exampleRuntimeOnlyExtension.hiddenCommand',
            surface: 'commandPalette',
            title: 'Hidden Runtime Command',
            category: 'Runtime',
            when: '',
            group: '',
          },
        ],
        registeredViewDetails: [],
      }
    }
    if (cmd === 'extension_task_list') {
      return []
    }
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
  extensions.enabledExtensionIds = []
  extensions.registry = [{
    id: 'example-runtime-only-extension',
    name: 'Example Runtime Only Extension',
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

  assert.equal(
    extensions.commandPaletteCommandsForContext({}).some(
      (entry) => entry.commandId === 'exampleRuntimeOnlyExtension.hiddenCommand',
    ),
    false,
  )

  const enabledSnapshot = await extensions.setExtensionEnabled('example-runtime-only-extension', true)
  assert.deepEqual(enabledSnapshot.enabledExtensionIds, ['example-runtime-only-extension'])
  assert.ok(
    ipcCalls.some(([cmd, args]) =>
      cmd === 'extension_host_activate' &&
      String(args?.params?.extensionId || '') === 'example-runtime-only-extension'
    ),
  )
  assert.equal(
    extensions.runtimeRegistry['example-runtime-only-extension']?.activated,
    true,
  )
  assert.equal(
    extensions.commandPaletteCommandsForContext({}).some(
      (entry) => entry.commandId === 'exampleRuntimeOnlyExtension.hiddenCommand',
    ),
    true,
  )

  console.log(JSON.stringify({
    ok: true,
    enabledRuntimeActivated: true,
    commandVisibleAfterEnable: true,
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
}
