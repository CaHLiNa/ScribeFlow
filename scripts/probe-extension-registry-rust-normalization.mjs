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

    if (cmd === 'extension_registry_list') {
      return []
    }
    if (cmd === 'extension_settings_load') {
      return {
        settingsExists: false,
        enabledExtensionIds: [],
        extensionConfig: {},
      }
    }
    if (cmd === 'extension_settings_save') {
      return args?.params?.settings || {
        enabledExtensionIds: [],
        extensionConfig: {},
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    listExtensions,
    loadExtensionSettings,
    saveExtensionSettings,
  } = await vite.ssrLoadModule('/src/services/extensions/extensionRegistry.js')

  await listExtensions(42, null)
  await loadExtensionSettings(42, false, { hydrateSecrets: 'true' })
  await saveExtensionSettings(42, null, false)
  await saveExtensionSettings(' /tmp/global ', ' /tmp/workspace ', {
    enabledExtensionIds: [' Example-Pdf-Extension '],
    extensionConfig: {
      ' Example-Pdf-Extension ': {
        targetLang: 'zh-CN',
      },
    },
  })

  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'extension_registry_list',
      'extension_settings_load',
      'extension_settings_save',
      'extension_settings_save',
    ],
  )
  assert.deepEqual(calls[0].args, {
    params: {
      globalConfigDir: 42,
      workspaceRoot: null,
      locale: 'en-US',
    },
  })
  assert.deepEqual(calls[1].args, {
    params: {
      globalConfigDir: 42,
      workspaceRoot: false,
      hydrateSecrets: 'true',
    },
  })
  assert.deepEqual(calls[2].args, {
    params: {
      globalConfigDir: 42,
      workspaceRoot: null,
      settings: false,
    },
  })
  assert.deepEqual(calls[3].args, {
    params: {
      globalConfigDir: ' /tmp/global ',
      workspaceRoot: ' /tmp/workspace ',
      settings: {
        enabledExtensionIds: [' Example-Pdf-Extension '],
        extensionConfig: {
          ' Example-Pdf-Extension ': {
            targetLang: 'zh-CN',
          },
        },
      },
    },
  })

  console.log('extension registry rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
