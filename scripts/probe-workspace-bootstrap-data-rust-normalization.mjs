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

function normalizeBootstrapParams(params = {}) {
  return {
    globalConfigDir: typeof params.globalConfigDir === 'string' ? params.globalConfigDir : '',
    workspaceDataDir: typeof params.workspaceDataDir === 'string' ? params.workspaceDataDir : '',
    workspacePath: typeof params.workspacePath === 'string' ? params.workspacePath : '',
    restoreEditorSession:
      typeof params.restoreEditorSession === 'boolean' ? params.restoreEditorSession : true,
    currentTree: Array.isArray(params.currentTree) ? params.currentTree : [],
    cachedRootExpandedDirs: Array.isArray(params.cachedRootExpandedDirs)
      ? params.cachedRootExpandedDirs
      : [],
    includeHidden: typeof params.includeHidden === 'boolean' ? params.includeHidden : true,
    hasCachedTree: params.hasCachedTree === true,
    displayPreferences:
      params.displayPreferences && typeof params.displayPreferences === 'object'
        ? params.displayPreferences
        : {},
  }
}

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'workspace_lifecycle_load_bootstrap_data') {
      const normalized = normalizeBootstrapParams(args?.params || {})
      return {
        referencesSnapshot: {},
        referenceStyles: [],
        zoteroConfig: null,
        documentWorkflowState: {},
        recentFiles: [],
        editorSessionState: normalized.restoreEditorSession ? { restored: true } : null,
        fileTreeState: normalized.workspacePath
          ? {
              tree: normalized.currentTree,
              displayTree: normalized.currentTree,
              flatFiles: normalized.currentTree.filter((entry) => entry.is_dir !== true),
              expandedDirs: normalized.cachedRootExpandedDirs,
            }
          : null,
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { loadWorkspaceBootstrapData } = await vite.ssrLoadModule('/src/services/workspaceRecents.js')

  const rawParams = {
    globalConfigDir: 42,
    workspaceDataDir: '/tmp/scribeflow-workspace-data',
    workspacePath: '/tmp/scribeflow-bootstrap',
    restoreEditorSession: 'no',
    currentTree: [
      {
        name: 'note.md',
        path: '/tmp/scribeflow-bootstrap/note.md',
        is_dir: false,
        children: null,
        modified: 1,
      },
    ],
    cachedRootExpandedDirs: 'not-an-array',
    includeHidden: null,
    hasCachedTree: 'yes',
    displayPreferences: {
      showHidden: 'not-a-bool',
      sortMode: 'recent',
      foldDirectories: 'yes',
    },
  }

  const result = await loadWorkspaceBootstrapData(rawParams)

  assert.deepEqual(calls.map((call) => call.cmd), ['workspace_lifecycle_load_bootstrap_data'])
  assert.deepEqual(calls[0].args.params, rawParams)
  assert.deepEqual(result.editorSessionState, { restored: true })
  assert.deepEqual(result.fileTreeState.flatFiles.map((entry) => entry.name), ['note.md'])

  console.log('workspace bootstrap data rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
