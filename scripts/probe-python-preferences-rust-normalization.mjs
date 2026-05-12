import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { createPinia } from 'pinia'
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

function normalizePythonPreferencePayload(preferences = {}) {
  const trimmed = String(preferences.interpreterPreference || '').trim()
  return {
    ...preferences,
    interpreterPreference:
      !trimmed || trimmed.toLowerCase() === 'auto'
        ? 'auto'
        : trimmed,
  }
}

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'python_preferences_normalize') {
      return normalizePythonPreferencePayload(args?.params?.preferences || {})
    }

    if (cmd === 'python_preferences_load') {
      return {
        interpreterPreference: 'auto',
      }
    }

    if (cmd === 'python_preferences_save') {
      return normalizePythonPreferencePayload(args?.params?.preferences || {})
    }

    if (cmd === 'python_runtime_list') {
      return {
        interpreters: [],
        selectedInterpreter: {},
        resolvedInterpreter: {},
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.js')
  const { usePythonStore } = await vite.ssrLoadModule('/src/stores/python.js')
  const {
    loadPythonPreferences,
    savePythonPreferences,
  } = await vite.ssrLoadModule('/src/services/pythonPreferences.js')
  const pinia = createPinia()
  const workspace = useWorkspaceStore(pinia)
  const python = usePythonStore(pinia)
  workspace.globalConfigDir = '/tmp/scribeflow-global-config'
  workspace.ensureGlobalConfigDir = async () => '/tmp/scribeflow-global-config'

  await loadPythonPreferences(42)
  const saved = await savePythonPreferences(42, {
    interpreterPreference: ' /usr/bin/python3 ',
  })

  assert.deepEqual(saved, {
    interpreterPreference: '/usr/bin/python3',
  })

  await python.persistPreferences({
    interpreterPreference: ' /opt/homebrew/bin/python3 ',
  })

  assert.equal(python.interpreterPreference, '/opt/homebrew/bin/python3')
  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'python_preferences_load',
      'python_preferences_save',
      'python_preferences_normalize',
      'python_preferences_save',
    ],
  )
  assert.deepEqual(calls[0].args.params, { globalConfigDir: 42 })
  assert.deepEqual(calls[1].args.params, {
    globalConfigDir: 42,
    preferences: {
      interpreterPreference: ' /usr/bin/python3 ',
    },
  })
  assert.equal(calls[3].args.params.preferences.interpreterPreference, '/opt/homebrew/bin/python3')

  await python.setInterpreterPreference(' AUTO ')

  assert.equal(python.interpreterPreference, 'auto')
  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'python_preferences_load',
      'python_preferences_save',
      'python_preferences_normalize',
      'python_preferences_save',
      'python_preferences_normalize',
      'python_preferences_save',
      'python_runtime_list',
    ],
  )
  assert.equal(calls[5].args.params.preferences.interpreterPreference, 'auto')

  console.log('python preferences rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
