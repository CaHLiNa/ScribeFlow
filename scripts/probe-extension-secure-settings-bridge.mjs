import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { createPinia, setActivePinia } from 'pinia'
import { createLogger, createServer } from 'vite'
import { secureSettingInputType } from '../src/domains/extensions/extensionSettingPresentation.js'

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
        enabledExtensionIds: ['example-pdf-extension'],
        extensionConfig: args?.params?.settings?.extensionConfig || {},
      }
    }
    if (cmd === 'extension_host_update_settings') {
      return {
        extensionId: args?.params?.extensionId || '',
        accepted: true,
        changedKeys: Object.keys(args?.params?.settings || {}),
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
  extensions.enabledExtensionIds = ['example-pdf-extension']
  extensions.extensionConfig = {
    'example-pdf-extension': {
      'examplePdfExtension.apiKey': 'sk-old',
      'examplePdfExtension.targetLang': 'zh-CN',
    },
  }
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
    settingsSchema: {
      'examplePdfExtension.apiKey': {
        key: 'examplePdfExtension.apiKey',
        type: 'string',
        default: '',
        label: 'API Key',
        description: 'Secret API key',
        secureStorage: true,
        options: [],
      },
      'examplePdfExtension.targetLang': {
        key: 'examplePdfExtension.targetLang',
        type: 'string',
        default: 'zh-CN',
        label: 'Target Language',
        description: 'Preferred target language',
        secureStorage: false,
        options: [],
      },
    },
    warnings: [],
    errors: [],
  }]
  extensions.runtimeRegistry['example-pdf-extension'] = {
    activated: true,
    registeredCommands: [],
    registeredCapabilities: [],
    registeredViews: [],
  }

  assert.equal(
    secureSettingInputType('examplePdfExtension.apiKey', {
      type: 'string',
      secureStorage: true,
    }),
    'password',
  )
  assert.equal(
    secureSettingInputType('examplePdfExtension.targetLang', {
      type: 'string',
      secureStorage: false,
    }),
    'text',
  )

  await extensions.setExtensionConfigValue(
    'example-pdf-extension',
    'examplePdfExtension.apiKey',
    'sk-new',
  )

  assert.equal(
    extensions.configForExtension({
      id: 'example-pdf-extension',
      settingsSchema: extensions.registry[0].settingsSchema,
    })['examplePdfExtension.apiKey'],
    'sk-new',
  )
  assert.ok(
    ipcCalls.some(([cmd, args]) =>
      cmd === 'extension_settings_save' &&
      args?.params?.settings?.extensionConfig?.['example-pdf-extension']?.['examplePdfExtension.apiKey'] === 'sk-new'
    ),
  )
  assert.ok(
    ipcCalls.some(([cmd, args]) =>
      cmd === 'extension_host_update_settings' &&
      String(args?.params?.extensionId || '') === 'example-pdf-extension' &&
      args?.params?.settings?.['examplePdfExtension.apiKey'] === 'sk-new'
    ),
  )

  console.log(JSON.stringify({
    ok: true,
    secureInputType: 'password',
    saveSettingsObserved: true,
    updateSettingsObserved: true,
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
}
