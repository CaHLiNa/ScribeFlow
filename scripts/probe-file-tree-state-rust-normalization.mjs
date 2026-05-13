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

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeBool(value, defaultValue = true) {
  return typeof value === 'boolean' ? value : defaultValue
}

function normalizeMaxDirs(value) {
  return Number.isInteger(value) && value >= 0 ? value : 6
}

function normalizeDisplayPreferences(value) {
  const preferences = value && typeof value === 'object' ? value : {}
  return {
    showHidden: normalizeBool(preferences.showHidden, true),
    sortMode: String(preferences.sortMode || '').trim().toLowerCase() === 'modified'
      ? 'modified'
      : 'name',
    foldDirectories: preferences.foldDirectories === true,
  }
}

function buildTreeResult(params = {}) {
  params = params && typeof params === 'object' ? params : {}
  const preferences = normalizeDisplayPreferences(params.displayPreferences)
  const tree = normalizeArray(params.currentTree)
  const extraDirs = normalizeArray(params.extraDirs)
  const cachedRootExpandedDirs = normalizeArray(params.cachedRootExpandedDirs)
  const expandedDirs = cachedRootExpandedDirs.slice(0, normalizeMaxDirs(params.maxDirs))
  return {
    tree,
    displayTree: preferences.showHidden ? tree : tree.filter((entry) => !String(entry.name || '').startsWith('.')),
    flatFiles: tree.filter((entry) => entry.is_dir !== true),
    expandedDirs: expandedDirs.length ? expandedDirs : extraDirs,
  }
}

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'fs_tree_load_workspace_state') {
      return buildTreeResult({
        ...args?.params,
        workspacePath: normalizeString(args?.params?.workspacePath),
        currentTree: normalizeArray(args?.params?.currentTree),
        extraDirs: normalizeArray(args?.params?.extraDirs),
        includeHidden: normalizeBool(args?.params?.includeHidden),
      })
    }

    if (cmd === 'fs_tree_reveal_workspace_state') {
      return {
        ...buildTreeResult({
          ...args?.params,
          workspacePath: normalizeString(args?.params?.workspacePath),
          targetPath: normalizeString(args?.params?.targetPath),
          currentTree: normalizeArray(args?.params?.currentTree),
          includeHidden: normalizeBool(args?.params?.includeHidden),
        }),
        expandedDirs: normalizeString(args?.params?.targetPath) ? ['/tmp/ws/nested'] : [],
      }
    }

    if (cmd === 'fs_tree_restore_cached_expanded_state') {
      return buildTreeResult({
        ...args?.params,
        workspacePath: normalizeString(args?.params?.workspacePath),
        currentTree: normalizeArray(args?.params?.currentTree),
        cachedRootExpandedDirs: normalizeArray(args?.params?.cachedRootExpandedDirs),
        maxDirs: normalizeMaxDirs(args?.params?.maxDirs),
        includeHidden: normalizeBool(args?.params?.includeHidden),
      })
    }

    if (cmd === 'fs_tree_resolve_display_state') {
      const tree = normalizeArray(args?.params?.tree)
      const preferences = normalizeDisplayPreferences(args?.params?.displayPreferences)
      return {
        displayTree: preferences.sortMode === 'modified'
          ? [...tree].sort((left, right) => (right.modified || 0) - (left.modified || 0))
          : [...tree].sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''))),
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    loadWorkspaceTreeState,
    revealWorkspaceTreeState,
    restoreCachedExpandedTreeState,
    resolveFileTreeDisplayState,
  } = await vite.ssrLoadModule('/src/services/fileTreeSystem.js')
  const { readWorkspaceTreeSnapshot } = await vite.ssrLoadModule('/src/services/workspaceSnapshotIO.js')

  const rawTree = [
    {
      name: 'zeta.md',
      path: '/tmp/ws/zeta.md',
      is_dir: false,
      children: null,
      modified: 1,
    },
    {
      name: 'alpha.md',
      path: '/tmp/ws/alpha.md',
      is_dir: false,
      children: null,
      modified: 5,
    },
  ]

  const loadParams = {
    workspacePath: 42,
    currentTree: rawTree,
    extraDirs: 'not-an-array',
    includeHidden: 'yes',
    displayPreferences: {
      showHidden: 'not-bool',
      sortMode: 'recent',
      foldDirectories: 'yes',
    },
  }
  await loadWorkspaceTreeState(loadParams)

  const revealParams = {
    workspacePath: '/tmp/ws',
    targetPath: 99,
    currentTree: 'not-a-tree',
    includeHidden: null,
  }
  await revealWorkspaceTreeState(revealParams)

  const restoreParams = {
    workspacePath: '/tmp/ws',
    currentTree: rawTree,
    cachedRootExpandedDirs: 'not-an-array',
    maxDirs: 'wide-open',
    includeHidden: undefined,
  }
  await restoreCachedExpandedTreeState(restoreParams)

  const displayParams = {
    tree: rawTree,
    displayPreferences: {
      showHidden: true,
      sortMode: ' MODIFIED ',
      foldDirectories: false,
    },
  }
  const displayResult = await resolveFileTreeDisplayState(displayParams)

  await readWorkspaceTreeSnapshot(42, 'not-an-array', {
    includeHidden: 'yes',
    displayPreferences: 'not-preferences',
  })
  await loadWorkspaceTreeState(false)
  await revealWorkspaceTreeState(null)
  await restoreCachedExpandedTreeState(0)
  await resolveFileTreeDisplayState('raw-display-params')

  assert.deepEqual(calls.map((call) => call.cmd), [
    'fs_tree_load_workspace_state',
    'fs_tree_reveal_workspace_state',
    'fs_tree_restore_cached_expanded_state',
    'fs_tree_resolve_display_state',
    'fs_tree_load_workspace_state',
    'fs_tree_load_workspace_state',
    'fs_tree_reveal_workspace_state',
    'fs_tree_restore_cached_expanded_state',
    'fs_tree_resolve_display_state',
  ])
  assert.deepEqual(calls[0].args.params, loadParams)
  assert.deepEqual(calls[1].args.params, revealParams)
  assert.deepEqual(calls[2].args.params, restoreParams)
  assert.deepEqual(calls[3].args.params, displayParams)
  assert.deepEqual(calls[4].args.params, {
    workspacePath: 42,
    currentTree: [],
    extraDirs: 'not-an-array',
    includeHidden: 'yes',
    displayPreferences: 'not-preferences',
  })
  assert.equal(calls[5].args.params, false)
  assert.equal(calls[6].args.params, null)
  assert.equal(calls[7].args.params, 0)
  assert.equal(calls[8].args.params, 'raw-display-params')
  assert.deepEqual(displayResult.displayTree.map((entry) => entry.name), ['alpha.md', 'zeta.md'])

  console.log('file tree state rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
