import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { createLogger, createServer } from 'vite'

if (!globalThis.window) {
  globalThis.window = globalThis
}

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto
}

if (!globalThis.navigator) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {},
  })
}

Object.defineProperty(globalThis.navigator, 'platform', {
  configurable: true,
  value: 'MacIntel',
})

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

    if (cmd === 'workspace_bookmark_remove') {
      return null
    }

    if (cmd === 'macos_capture_workspace_bookmark') {
      return { path: '/tmp/captured', bookmark: 'bookmark' }
    }

    if (cmd === 'macos_activate_workspace_bookmark_for_path') {
      return { path: '/tmp/activated', bookmark: null }
    }

    if (cmd === 'macos_release_workspace_access') {
      return null
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    activateWorkspaceBookmark,
    captureWorkspaceBookmark,
    releaseWorkspaceBookmark,
    removeWorkspaceBookmark,
  } = await vite.ssrLoadModule('/src/services/workspacePermissions.ts')

  removeWorkspaceBookmark(' /tmp/remove/// ')
  await captureWorkspaceBookmark(' /tmp/capture/// ')
  await activateWorkspaceBookmark(' /tmp/activate/// ')
  await releaseWorkspaceBookmark(' /tmp/release/// ')

  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'workspace_bookmark_remove',
      'macos_capture_workspace_bookmark',
      'macos_activate_workspace_bookmark_for_path',
      'macos_release_workspace_access',
    ],
  )
  assert.deepEqual(calls[0].args.params, { path: ' /tmp/remove/// ' })
  assert.deepEqual(calls[1].args.params, { path: ' /tmp/capture/// ' })
  assert.deepEqual(calls[2].args.params, { path: ' /tmp/activate/// ' })
  assert.deepEqual(calls[3].args, { path: ' /tmp/release/// ' })

  console.log('workspace access rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
