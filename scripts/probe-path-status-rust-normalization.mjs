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

    if (cmd === 'path_status' || cmd === 'workspace_path_status') {
      const path = typeof args?.path === 'string' ? args.path.trim() : ''
      return {
        path,
        exists: Boolean(path),
        isDir: false,
        isFile: Boolean(path),
        size: 12,
        modified: 34,
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    getPathStatus,
    getWorkspacePathStatus,
  } = await vite.ssrLoadModule('/src/services/pathStatus.js')

  const fileStatus = await getPathStatus(' /tmp/scribeflow-path.md ')
  const numericStatus = await getWorkspacePathStatus(42)

  assert.deepEqual(
    calls.map((call) => call.cmd),
    ['path_status', 'workspace_path_status'],
  )
  assert.deepEqual(calls[0].args, { path: ' /tmp/scribeflow-path.md ' })
  assert.deepEqual(calls[1].args, { path: 42 })
  assert.equal(fileStatus.path, '/tmp/scribeflow-path.md')
  assert.equal(fileStatus.exists, true)
  assert.equal(numericStatus.path, '')
  assert.equal(numericStatus.exists, false)

  console.log('path status rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
