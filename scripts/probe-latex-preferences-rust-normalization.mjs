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

function normalizeLatexPreferencePayload(preferences = {}) {
  const compilerPreference = ['system', 'tectonic'].includes(
    String(preferences.compilerPreference || '').trim().toLowerCase(),
  )
    ? String(preferences.compilerPreference || '').trim().toLowerCase()
    : 'auto'
  const enginePreference = compilerPreference === 'tectonic'
    ? 'auto'
    : ['xelatex', 'pdflatex', 'lualatex'].includes(
        String(preferences.enginePreference || '').trim().toLowerCase(),
      )
      ? String(preferences.enginePreference || '').trim().toLowerCase()
      : 'auto'

  return {
    ...preferences,
    compilerPreference,
    enginePreference,
    autoCompile: false,
    formatOnSave: false,
    buildExtraArgs: String(preferences.buildExtraArgs || '').trim(),
    customSystemTexPath: String(preferences.customSystemTexPath || '').trim(),
  }
}

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'latex_preferences_normalize') {
      return normalizeLatexPreferencePayload(args?.params?.preferences || {})
    }

    if (cmd === 'latex_preferences_save') {
      return args?.params?.preferences || {}
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.js')
  const { useLatexStore } = await vite.ssrLoadModule('/src/stores/latex.js')
  const pinia = createPinia()
  const workspace = useWorkspaceStore(pinia)
  const latex = useLatexStore(pinia)
  workspace.globalConfigDir = '/tmp/scribeflow-global-config'
  workspace.ensureGlobalConfigDir = async () => '/tmp/scribeflow-global-config'

  await latex.persistPreferences({
    compilerPreference: ' tectonic ',
    enginePreference: 'xelatex',
    autoCompile: true,
    formatOnSave: true,
    buildExtraArgs: '  --keep-logs  ',
    customSystemTexPath: ' /Library/TeX/texbin ',
  })

  assert.equal(latex.compilerPreference, 'tectonic')
  assert.equal(latex.enginePreference, 'auto')
  assert.equal(latex.autoCompile, false)
  assert.equal(latex.formatOnSave, false)
  assert.equal(latex.buildExtraArgs, '--keep-logs')
  assert.equal(latex.customSystemTexPath, '/Library/TeX/texbin')

  assert.deepEqual(
    calls.map((call) => call.cmd),
    ['latex_preferences_normalize', 'latex_preferences_save'],
  )
  assert.equal(calls[1].args.params.preferences.compilerPreference, 'tectonic')
  assert.equal(calls[1].args.params.preferences.enginePreference, 'auto')
  assert.equal(calls[1].args.params.preferences.autoCompile, false)
  assert.equal(calls[1].args.params.preferences.formatOnSave, false)
  assert.equal(calls[1].args.params.preferences.buildExtraArgs, '--keep-logs')
  assert.equal(calls[1].args.params.preferences.customSystemTexPath, '/Library/TeX/texbin')

  console.log('latex preferences rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
