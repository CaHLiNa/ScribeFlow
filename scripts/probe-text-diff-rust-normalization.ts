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

    if (cmd === 'text_diff_compute_minimal_change') {
      return { from: 1, to: 2, insert: 'x' }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { computeMinimalChange } = await vite.ssrLoadModule('/src/services/textDiff.ts')

  await computeMinimalChange(42, false)
  await computeMinimalChange(' alpha ', ' alpha beta ')

  assert.deepEqual(
    calls.map((call) => call.cmd),
    ['text_diff_compute_minimal_change', 'text_diff_compute_minimal_change'],
  )
  assert.deepEqual(calls[0].args.params, { oldText: 42, newText: false })
  assert.deepEqual(calls[1].args.params, {
    oldText: ' alpha ',
    newText: ' alpha beta ',
  })

  console.log('text diff rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
