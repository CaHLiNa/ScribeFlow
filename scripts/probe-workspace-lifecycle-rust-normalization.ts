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

function normalizeString(value) {
  return typeof value === 'string' ? value : ''
}

function createLifecycleState(state = {}) {
  const source = state && typeof state === 'object' && !Array.isArray(state) ? state : {}
  return {
    recentWorkspaces: Array.isArray(source.recentWorkspaces) ? source.recentWorkspaces : [],
    lastWorkspace: normalizeString(source.lastWorkspace),
    setupComplete: source.setupComplete === true,
    reopenLastWorkspaceOnLaunch:
      typeof source.reopenLastWorkspaceOnLaunch === 'boolean'
        ? source.reopenLastWorkspaceOnLaunch
        : true,
    reopenLastSessionOnLaunch:
      typeof source.reopenLastSessionOnLaunch === 'boolean'
        ? source.reopenLastSessionOnLaunch
        : true,
  }
}

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'workspace_lifecycle_load') {
      return createLifecycleState()
    }

    if (cmd === 'workspace_lifecycle_save') {
      return createLifecycleState(args?.params?.state)
    }

    if (cmd === 'workspace_lifecycle_prepare_open') {
      const globalConfigDir = normalizeString(args?.params?.globalConfigDir)
      const path = normalizeString(args?.params?.path)
      return {
        ...createLifecycleState({ setupComplete: true, lastWorkspace: path }),
        path,
        globalConfigDir,
        workspaceId: path ? 'workspace-id' : '',
        workspaceDataDir: globalConfigDir ? `${globalConfigDir}/workspaces/workspace-id` : '',
        claudeConfigDir: globalConfigDir ? `${globalConfigDir}/../.claude` : '',
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    loadWorkspaceLifecycleState,
    saveWorkspaceLifecycleState,
    prepareWorkspaceOpen,
  } = await vite.ssrLoadModule('/src/services/workspaceRecents.ts')

  const loaded = await loadWorkspaceLifecycleState(42)
  const saved = await saveWorkspaceLifecycleState(42, 'not-a-state')
  const preparedInvalid = await prepareWorkspaceOpen(42, null)
  const preparedValid = await prepareWorkspaceOpen('/tmp/config', '/tmp/workspace')

  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'workspace_lifecycle_load',
      'workspace_lifecycle_save',
      'workspace_lifecycle_prepare_open',
      'workspace_lifecycle_prepare_open',
    ],
  )
  assert.deepEqual(calls[0].args.params, { globalConfigDir: 42 })
  assert.deepEqual(calls[1].args.params, {
    globalConfigDir: 42,
    state: 'not-a-state',
  })
  assert.deepEqual(calls[2].args.params, { globalConfigDir: 42, path: null })
  assert.deepEqual(calls[3].args.params, {
    globalConfigDir: '/tmp/config',
    path: '/tmp/workspace',
  })
  assert.deepEqual(loaded.recentWorkspaces, [])
  assert.equal(saved.reopenLastWorkspaceOnLaunch, true)
  assert.equal(preparedInvalid.path, '')
  assert.equal(preparedValid.path, '/tmp/workspace')
  assert.equal(preparedValid.workspaceId, 'workspace-id')

  console.log('workspace lifecycle rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
