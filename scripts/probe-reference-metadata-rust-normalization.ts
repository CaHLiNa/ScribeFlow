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
  const refreshResult = 'rust-owned-metadata-refresh'

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'references_refresh_metadata') {
      return refreshResult
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { refreshReferenceMetadata } = await vite.ssrLoadModule(
    '/src/services/references/crossref.ts',
  )

  const result = await refreshReferenceMetadata(false)
  const targetResult = await refreshReferenceMetadata({
    references: [{ id: 'ref-a', title: 'Alpha' }],
    referenceId: ' ref-a ',
  })

  assert.deepEqual(calls.map((call) => call.cmd), [
    'references_refresh_metadata',
    'references_refresh_metadata',
  ])
  assert.deepEqual(calls[0].args.params, { reference: false })
  assert.deepEqual(calls[1].args.params, {
    reference: {},
    references: [{ id: 'ref-a', title: 'Alpha' }],
    referenceId: ' ref-a ',
  })
  assert.strictEqual(result, refreshResult)
  assert.strictEqual(targetResult, refreshResult)

  console.log('reference metadata rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
