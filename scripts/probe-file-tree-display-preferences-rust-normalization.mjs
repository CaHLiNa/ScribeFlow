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

const sourceTree = [
  {
    name: 'zeta.md',
    path: '/tmp/scribeflow-file-tree-preferences/zeta.md',
    is_dir: false,
    children: null,
    modified: 1,
  },
  {
    name: 'alpha.md',
    path: '/tmp/scribeflow-file-tree-preferences/alpha.md',
    is_dir: false,
    children: null,
    modified: 5,
  },
]

function normalizeDisplayPreferences(preferences = {}) {
  return {
    showHidden: preferences.showHidden !== false,
    sortMode: String(preferences.sortMode || '').trim().toLowerCase() === 'modified'
      ? 'modified'
      : 'name',
    foldDirectories: preferences.foldDirectories === true,
  }
}

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'fs_tree_resolve_display_state') {
      const preferences = normalizeDisplayPreferences(args?.params?.displayPreferences || {})
      const displayTree = [...(Array.isArray(args?.params?.tree) ? args.params.tree : [])]
        .sort((left, right) => {
          if (preferences.sortMode === 'modified') {
            return (right.modified || 0) - (left.modified || 0)
          }
          return String(left.name || '').localeCompare(String(right.name || ''))
        })

      return { displayTree }
    }

    if (cmd === 'workspace_lifecycle_load_bootstrap_data') {
      return {
        workspaceState: null,
        editorState: null,
        treeState: {
          tree: sourceTree,
          displayTree: sourceTree,
          flatFiles: sourceTree,
          expandedDirs: [],
        },
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { resolveFileTreeDisplayState } = await vite.ssrLoadModule('/src/services/fileTreeSystem.js')
  const { loadWorkspaceBootstrapData } = await vite.ssrLoadModule('/src/services/workspaceRecents.js')

  const displayResult = await resolveFileTreeDisplayState({
    tree: sourceTree,
    displayPreferences: {
      showHidden: 'not-a-boolean',
      sortMode: 'recent',
      foldDirectories: 'yes',
    },
  })

  assert.deepEqual(displayResult.displayTree.map((entry) => entry.name), ['alpha.md', 'zeta.md'])
  assert.deepEqual(calls[0].args.params.displayPreferences, {
    showHidden: 'not-a-boolean',
    sortMode: 'recent',
    foldDirectories: 'yes',
  })

  await loadWorkspaceBootstrapData({
    workspacePath: '/tmp/scribeflow-file-tree-preferences',
    displayPreferences: {
      showHidden: false,
      sortMode: ' MODIFIED ',
      foldDirectories: true,
    },
  })

  assert.deepEqual(calls[1].args.params.displayPreferences, {
    showHidden: false,
    sortMode: ' MODIFIED ',
    foldDirectories: true,
  })

  console.log('file tree display preferences rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
