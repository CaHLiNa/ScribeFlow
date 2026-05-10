import assert from 'node:assert/strict'
import { createPinia } from 'pinia'
import { computed } from 'vue'
import { createLogger, createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
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

try {
  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.js')
  const { useFilesStore } = await vite.ssrLoadModule('/src/stores/files.js')
  const { useEditorStore } = await vite.ssrLoadModule('/src/stores/editor.js')
  const { applyFileTreeDisplayPreferences } = await vite.ssrLoadModule(
    '/src/domains/files/fileTreeDisplayRuntime.js',
  )
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

  const displayEntries = applyFileTreeDisplayPreferences(tree, {
    showHidden: false,
    sortMode: 'name',
    foldDirectories: false,
  })
  assert.equal(typeof displayEntries?.then, 'undefined')
  assert.deepEqual(displayEntries.map((entry) => entry.name), ['alpha', 'zeta.md'])

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
    applyFileTreeDisplayPreferences(files.tree, {
      showHidden: workspace.fileTreeShowHidden,
      sortMode: workspace.fileTreeSortMode,
      foldDirectories: workspace.fileTreeFoldDirectories,
    })
  )
  assert.equal(typeof fileTreeDisplayEntries.value?.then, 'undefined')
  assert.deepEqual(fileTreeDisplayEntries.value.map((entry) => entry.name), ['alpha', 'zeta.md'])
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
  await vite.close()
}
