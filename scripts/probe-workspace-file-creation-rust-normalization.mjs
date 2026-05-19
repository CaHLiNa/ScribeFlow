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

    if (cmd === 'workspace_create_file') {
      return {
        ok: true,
        path: '/tmp/workspace/note.tex',
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { createWorkspaceFile } = await vite.ssrLoadModule('/src/services/fileStoreIO.ts')

  await createWorkspaceFile(' /tmp/workspace ', ' note.tex ', {
    initialContent: 42,
  })
  await createWorkspaceFile(' /tmp/workspace ', ' body.tex ', {
    initialContent: '  body keeps spaces  ',
  })

  assert.deepEqual(
    calls.map((call) => call.cmd),
    ['workspace_create_file', 'workspace_create_file'],
  )
  assert.deepEqual(calls[0].args.params, {
    dirPath: ' /tmp/workspace ',
    name: ' note.tex ',
    initialContent: 42,
  })
  assert.deepEqual(calls[1].args.params, {
    dirPath: ' /tmp/workspace ',
    name: ' body.tex ',
    initialContent: '  body keeps spaces  ',
  })

  console.log('workspace file creation rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
