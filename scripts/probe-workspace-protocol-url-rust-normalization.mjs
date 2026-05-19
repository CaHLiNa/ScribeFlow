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

    if (cmd === 'workspace_protocol_url_resolve') {
      return 'scribeflow-workspace://localhost/workspace/notes/a.md'
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { toWorkspaceProtocolUrl } = await vite.ssrLoadModule('/src/services/workspaceProtocolUrl.ts')

  const workspace = {
    path: ' /tmp/workspace ',
    workspaceDataDir: false,
    globalConfigDir: 42,
  }
  const options = {
    version: ' revision 1 ',
  }

  const resolved = await toWorkspaceProtocolUrl(17, workspace, options)
  await toWorkspaceProtocolUrl(' /tmp/workspace/notes/a.md ', null, false)

  assert.equal(resolved, 'scribeflow-workspace://localhost/workspace/notes/a.md')
  assert.deepEqual(calls.map((call) => call.cmd), [
    'workspace_protocol_url_resolve',
    'workspace_protocol_url_resolve',
  ])
  assert.deepEqual(calls[0].args.params, {
    filePath: 17,
    workspace,
    options,
  })
  assert.deepEqual(calls[1].args.params, {
    filePath: ' /tmp/workspace/notes/a.md ',
    workspace: null,
    options: false,
  })

  console.log('workspace protocol url rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
