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

    if (cmd === 'workspace_open_path_in_default_app') {
      return null
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { openLocalPath } = await vite.ssrLoadModule('/src/services/localFileOpen.ts')

  const openedStringPath = await openLocalPath(' /tmp/scribeflow-open.md ')
  const openedNumericPath = await openLocalPath(42)

  assert.equal(openedStringPath, true)
  assert.equal(openedNumericPath, true)
  assert.deepEqual(
    calls.map((call) => call.cmd),
    ['workspace_open_path_in_default_app', 'workspace_open_path_in_default_app'],
  )
  assert.deepEqual(calls[0].args, { path: ' /tmp/scribeflow-open.md ' })
  assert.deepEqual(calls[1].args, { path: 42 })

  console.log('local file open rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
