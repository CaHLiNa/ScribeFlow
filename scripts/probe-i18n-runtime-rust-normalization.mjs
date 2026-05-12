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

    if (cmd === 'get_global_config_dir') {
      return 42
    }

    if (cmd === 'i18n_runtime_load') {
      return {
        locale: 'en-US',
        systemLocale: 'en-US',
        messages: {},
        aliases: {},
      }
    }

    if (cmd === 'workspace_preferences_load') {
      return {
        preferredLocale: 'zh-CN',
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    loadI18nRuntime,
    loadSavedLocalePreference,
  } = await vite.ssrLoadModule('/src/services/i18nRuntime.js')

  await loadI18nRuntime(42)
  await loadI18nRuntime(' zh-CN ')
  const savedPreference = await loadSavedLocalePreference(false)

  assert.equal(savedPreference, 'zh-CN')
  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'i18n_runtime_load',
      'i18n_runtime_load',
      'get_global_config_dir',
      'workspace_preferences_load',
    ],
  )
  assert.deepEqual(calls[0].args, {
    params: {
      preferredLocale: 42,
    },
  })
  assert.deepEqual(calls[1].args, {
    params: {
      preferredLocale: ' zh-CN ',
    },
  })
  assert.deepEqual(calls[3].args, {
    params: {
      globalConfigDir: 42,
    },
  })

  console.log('i18n runtime rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
