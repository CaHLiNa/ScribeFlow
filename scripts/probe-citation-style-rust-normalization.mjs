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

    if (cmd === 'citation_style_list_available') {
      return [{ id: 'apa', name: 'APA 7th Edition', category: 'Author-date', fast: true }]
    }
    if (cmd === 'citation_style_get_info') {
      return { id: 'ieee', name: 'IEEE', category: 'Numeric', fast: true }
    }
    if (cmd === 'citation_style_normalize') {
      return 'apa'
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    getAvailableCitationStyles,
    getCitationStyleInfo,
    normalizeCitationStyle,
  } = await vite.ssrLoadModule('/src/services/references/citationStyleRuntime.js')

  await getAvailableCitationStyles()
  await getCitationStyleInfo(42)
  await normalizeCitationStyle(' ieee ')

  assert.deepEqual(calls.map((call) => call.cmd), [
    'citation_style_list_available',
    'citation_style_get_info',
    'citation_style_normalize',
  ])
  assert.deepEqual(calls[0].args, {})
  assert.deepEqual(calls[1].args.params, { styleId: 42 })
  assert.deepEqual(calls[2].args.params, { styleId: ' ieee ' })

  console.log('citation style rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
