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

    if (cmd === 'references_mutation_apply') {
      return {
        snapshot: args?.params?.snapshot || {},
        result: { changed: false },
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { applyReferenceMutation } = await vite.ssrLoadModule(
    '/src/services/references/referenceRuntime.js',
  )

  await applyReferenceMutation({
    globalConfigDir: false,
    snapshot: 'not-a-snapshot',
    action: 'not-an-action',
  })
  await applyReferenceMutation(null)

  assert.deepEqual(calls.map((call) => call.cmd), [
    'references_mutation_apply',
    'references_mutation_apply',
  ])
  assert.deepEqual(calls[0].args.params, {
    globalConfigDir: false,
    snapshot: 'not-a-snapshot',
    action: 'not-an-action',
  })
  assert.equal(calls[1].args.params, null)

  console.log('reference mutation rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
