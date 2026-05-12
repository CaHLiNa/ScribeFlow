import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { createPinia } from 'pinia'
import { computed } from 'vue'
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

  mockIPC(async (cmd, args) => {
    if (cmd === 'fs_tree_resolve_display_state') {
      const sourceTree = Array.isArray(args?.params?.tree) ? args.params.tree : []
      const prefs = args?.params?.displayPreferences || {}
      const showHidden = prefs.showHidden !== false
      const filtered = sourceTree.filter((entry) => showHidden || !String(entry.name || '').startsWith('.'))
      return {
        displayTree: filtered.sort((left, right) => {
          if (left.is_dir !== right.is_dir) return left.is_dir ? -1 : 1
          return String(left.name || '').localeCompare(String(right.name || ''))
        }),
      }
    }
    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.js')
  const { useFilesStore } = await vite.ssrLoadModule('/src/stores/files.js')
  const { useEditorStore } = await vite.ssrLoadModule('/src/stores/editor.js')
  const { listWorkspaceFlatFileEntries } = await vite.ssrLoadModule(
    '/src/domains/files/workspaceSnapshotFlatFilesRuntime.js',
  )

  const tree = [
    {
      name: 'zeta.md',
      path: '/tmp/scribeflow-sync-contract/zeta.md',
      is_dir: false,
      children: null,
      modified: 1,
    },
    {
      name: '.hidden.md',
      path: '/tmp/scribeflow-sync-contract/.hidden.md',
      is_dir: false,
      children: null,
      modified: 2,
    },
    {
      name: 'alpha',
      path: '/tmp/scribeflow-sync-contract/alpha',
      is_dir: true,
      children: [
        {
          name: 'note.md',
          path: '/tmp/scribeflow-sync-contract/alpha/note.md',
          is_dir: false,
          children: null,
          modified: 3,
        },
      ],
      modified: null,
    },
  ]
  const snapshot = {
    tree,
    displayTree: [
      {
        name: 'alpha',
        path: '/tmp/scribeflow-sync-contract/alpha',
        is_dir: true,
        children: [
          {
            name: 'note.md',
            path: '/tmp/scribeflow-sync-contract/alpha/note.md',
            is_dir: false,
            children: null,
            modified: 3,
          },
        ],
        modified: null,
      },
      {
        name: 'zeta.md',
        path: '/tmp/scribeflow-sync-contract/zeta.md',
        is_dir: false,
        children: null,
        modified: 1,
      },
    ],
    flatFiles: [
      '/tmp/scribeflow-sync-contract/zeta.md',
      {
        name: 'note.md',
        path: '/tmp/scribeflow-sync-contract/alpha/note.md',
        is_dir: false,
      },
      {
        name: 'alpha',
        path: '/tmp/scribeflow-sync-contract/alpha',
        is_dir: true,
      },
    ],
  }

  const flatFiles = listWorkspaceFlatFileEntries(snapshot)
  assert.equal(typeof flatFiles?.then, 'undefined')
  assert.deepEqual(flatFiles.map((entry) => entry.path), [
    '/tmp/scribeflow-sync-contract/zeta.md',
    '/tmp/scribeflow-sync-contract/alpha/note.md',
  ])

  const pinia = createPinia()
  const workspace = useWorkspaceStore(pinia)
  const files = useFilesStore(pinia)
  const editor = useEditorStore(pinia)

  workspace.path = '/tmp/scribeflow-sync-contract'
  workspace.leftSidebarOpen = true
  workspace.leftSidebarPanel = 'files'
  workspace.primarySurface = 'workspace'
  workspace.fileTreeShowHidden = false
  workspace.fileTreeSortMode = 'name'
  workspace.fileTreeFoldDirectories = false
  files.applyBootstrapTreeState(snapshot, workspace.path)
  editor.applyRecentFilesSnapshot([
    { path: '/tmp/scribeflow-sync-contract/alpha/note.md', openedAt: 1 },
    { path: '/tmp/scribeflow-sync-contract/missing.md', openedAt: 2 },
  ])

  const fileTreeDisplayEntries = computed(() =>
    files.fileTreeDisplayEntries
  )
  assert.equal(typeof fileTreeDisplayEntries.value?.then, 'undefined')
  assert.deepEqual(fileTreeDisplayEntries.value.map((entry) => entry.name), ['alpha', 'zeta.md'])

  files.displayTree = []
  await files.refreshFileTreeDisplayState()
  assert.equal(typeof files.fileTreeDisplayEntries?.then, 'undefined')
  assert.deepEqual(files.fileTreeDisplayEntries.map((entry) => entry.name), ['alpha', 'zeta.md'])

  assert.equal(editor.recentFilesForEmptyState.length, 1)
  assert.equal(
    editor.recentFilesForEmptyState[0].path,
    '/tmp/scribeflow-sync-contract/alpha/note.md',
  )

  workspace.openSettings('general')
  assert.equal(workspace.primarySurface, 'settings')
  assert.equal(workspace.settingsOpen, true)
  assert.equal(workspace.settingsSection, 'general')

  console.log('sidebar sync runtime contract probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
