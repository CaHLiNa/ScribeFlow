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

function resolvePlan(payload = {}) {
  const hasCachedTree = payload?.hasCachedTree === true
  return {
    blockOnInitialTreeLoad: !hasCachedTree,
    backgroundWindowMs: 600,
    tasks: [
      {
        key: 'workspace.loadBootstrapData',
        delayMs: 0,
        awaitCompletion: true,
        awaitTreeLoad: false,
      },
      {
        key: 'references.zoteroAutoSync',
        delayMs: 80,
        awaitCompletion: false,
        awaitTreeLoad: false,
      },
      {
        key: 'files.startWatching',
        delayMs: 0,
        awaitCompletion: false,
        awaitTreeLoad: false,
      },
    ],
  }
}

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'workspace_lifecycle_resolve_bootstrap_plan') {
      return resolvePlan(args?.params || {})
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { resolveWorkspaceBootstrapPlan } = await vite.ssrLoadModule('/src/services/workspaceRecents.js')

  const rawOptions = {
    hasCachedTree: 'yes',
    restoreEditorSession: 'no',
    ignoredFutureOption: 1,
  }
  const uncachedPlan = await resolveWorkspaceBootstrapPlan(rawOptions)
  const cachedPlan = await resolveWorkspaceBootstrapPlan({
    hasCachedTree: true,
    restoreEditorSession: false,
  })

  assert.deepEqual(calls.map((call) => call.cmd), [
    'workspace_lifecycle_resolve_bootstrap_plan',
    'workspace_lifecycle_resolve_bootstrap_plan',
  ])
  assert.deepEqual(calls[0].args.params, rawOptions)
  assert.equal(uncachedPlan.blockOnInitialTreeLoad, true)
  assert.equal(cachedPlan.blockOnInitialTreeLoad, false)
  assert.deepEqual(
    uncachedPlan.tasks.map((task) => task.key),
    ['workspace.loadBootstrapData', 'references.zoteroAutoSync', 'files.startWatching'],
  )

  console.log('workspace bootstrap plan rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
