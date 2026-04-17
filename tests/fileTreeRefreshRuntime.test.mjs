import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createVisibleTreeRefreshRuntime,
  mergePreservingLoadedChildren,
  patchTreeEntry,
} from '../src/domains/files/fileTreeRefreshRuntime.js'

globalThis.window = globalThis.window || {}
window.__TAURI_INTERNALS__ = {
  invoke: async (command, args = {}) => {
    if (command === 'fs_tree_merge_loaded_children') {
      const merge = (nextEntries = [], previousEntries = []) => {
        const previousByPath = new Map(previousEntries.map((entry) => [entry.path, entry]))
        return nextEntries.map((entry) => {
          const previous = previousByPath.get(entry.path)
          if (!entry.is_dir || !previous?.is_dir) return entry
          if (Array.isArray(previous.children)) {
            if (!Array.isArray(entry.children)) {
              return { ...entry, children: previous.children }
            }
            return { ...entry, children: merge(entry.children, previous.children) }
          }
          return entry
        })
      }
      return merge(args.params?.nextEntries || [], args.params?.previousEntries || [])
    }
    if (command === 'fs_tree_collect_loaded_dirs') {
      const walk = (entries = [], paths = []) => {
        for (const entry of entries) {
          if (!entry.is_dir || !Array.isArray(entry.children)) continue
          paths.push(entry.path)
          walk(entry.children, paths)
        }
        return paths
      }
      const paths = walk(args.params?.entries || [])
      for (const dir of args.params?.extraDirs || []) {
        if (dir && dir !== args.params?.workspacePath && !paths.includes(dir)) {
          paths.push(dir)
        }
      }
      return paths.sort((a, b) => a.length - b.length)
    }
    if (command === 'fs_tree_patch_dir_children') {
      const patch = (entries = [], targetPath = '', children = []) =>
        entries.map((entry) => {
          if (entry.path === targetPath) return { ...entry, children }
          if (Array.isArray(entry.children)) {
            return { ...entry, children: patch(entry.children, targetPath, children) }
          }
          return entry
        })
      return patch(args.params?.entries || [], args.params?.targetPath || '', args.params?.children || [])
    }
    throw new Error(`Unexpected invoke command: ${command}`)
  },
}

test('mergePreservingLoadedChildren keeps previously loaded nested children', async () => {
  const previous = [
    {
      path: '/ws/docs',
      is_dir: true,
      children: [
        { path: '/ws/docs/chapter1.md', is_dir: false },
      ],
    },
  ]

  const next = [
    {
      path: '/ws/docs',
      is_dir: true,
    },
  ]

  assert.deepEqual(await mergePreservingLoadedChildren(next, previous), [
    {
      path: '/ws/docs',
      is_dir: true,
      children: [
        { path: '/ws/docs/chapter1.md', is_dir: false },
      ],
    },
  ])
})

test('patchTreeEntry updates a nested directory entry in place', async () => {
  const tree = [
    {
      path: '/ws/docs',
      is_dir: true,
      children: [
        { path: '/ws/docs/chapter1.md', is_dir: false },
      ],
    },
  ]

  const patched = await patchTreeEntry(tree, '/ws/docs', (entry) => ({
    ...entry,
    children: [
      ...entry.children,
      { path: '/ws/docs/chapter2.md', is_dir: false },
    ],
  }))

  assert.deepEqual(patched, [
    {
      path: '/ws/docs',
      is_dir: true,
      children: [
        { path: '/ws/docs/chapter1.md', is_dir: false },
        { path: '/ws/docs/chapter2.md', is_dir: false },
      ],
    },
  ])
})

test('refreshVisibleTree refreshes loaded directories and coalesces queued refreshes', async () => {
  let currentTree = [
    {
      path: '/ws/docs',
      is_dir: true,
      children: [
        { path: '/ws/docs/chapter1.md', is_dir: false, modified: 1 },
      ],
    },
  ]

  const rootResults = [
    [
      { path: '/ws/docs', is_dir: true },
    ],
    [
      { path: '/ws/docs', is_dir: true },
      { path: '/ws/notes.md', is_dir: false },
    ],
  ]
  const docsResults = [
    [
      { path: '/ws/docs/chapter1.md', is_dir: false, modified: 2 },
    ],
    [
      { path: '/ws/docs/chapter1.md', is_dir: false, modified: 2 },
      { path: '/ws/docs/chapter2.md', is_dir: false, modified: 3 },
    ],
  ]

  let rootCalls = 0
  let docsCalls = 0
  let applyCalls = 0
  let beginCalls = 0
  let finishCalls = 0

  let releaseFirstRootRead
  const firstRootRead = new Promise((resolve) => {
    releaseFirstRootRead = resolve
  })

  const runtime = createVisibleTreeRefreshRuntime({
    getWorkspacePath: () => '/ws',
    getCurrentTree: () => currentTree,
    findCurrentEntry: (path) => {
      const walk = (entries = []) => {
        for (const entry of entries) {
          if (entry.path === path) return entry
          if (Array.isArray(entry.children)) {
            const found = walk(entry.children)
            if (found) return found
          }
        }
        return null
      }
      return walk(currentTree)
    },
    readDirShallow: async (path) => {
      if (path === '/ws') {
        rootCalls += 1
        if (rootCalls === 1) {
          await firstRootRead
        }
        return rootResults[Math.min(rootCalls - 1, rootResults.length - 1)]
      }
      if (path === '/ws/docs') {
        docsCalls += 1
        return docsResults[Math.min(docsCalls - 1, docsResults.length - 1)]
      }
      throw new Error(`Unexpected path ${path}`)
    },
    applyTree: (nextTree) => {
      applyCalls += 1
      currentTree = nextTree
    },
    setLastLoadError: (error) => {
      assert.equal(error, null)
    },
    beginReconcile: () => {
      beginCalls += 1
    },
    finishReconcile: () => {
      finishCalls += 1
    },
    failReconcile: () => {
      throw new Error('refresh should not fail in this test')
    },
    refreshConcurrency: 2,
  })

  const firstRefresh = runtime.refreshVisibleTree({ reason: 'watch', suppressErrors: true })
  const secondRefresh = runtime.refreshVisibleTree({ reason: 'watch', suppressErrors: true })

  releaseFirstRootRead()
  const [firstResult, secondResult] = await Promise.all([firstRefresh, secondRefresh])

  assert.equal(rootCalls, 2)
  assert.equal(docsCalls, 2)
  assert.equal(applyCalls, 2)
  assert.equal(beginCalls, 2)
  assert.equal(finishCalls, 2)
  assert.deepEqual(firstResult, currentTree)
  assert.deepEqual(secondResult, currentTree)
  assert.deepEqual(currentTree, [
    {
      path: '/ws/docs',
      is_dir: true,
      children: [
        { path: '/ws/docs/chapter1.md', is_dir: false, modified: 2 },
        { path: '/ws/docs/chapter2.md', is_dir: false, modified: 3 },
      ],
    },
    { path: '/ws/notes.md', is_dir: false },
  ])
})

test('refreshVisibleTree uses rust-backed visible tree snapshots when available', async () => {
  let currentTree = [
    {
      path: '/ws/docs',
      is_dir: true,
      children: [
        {
          path: '/ws/docs/chapters',
          is_dir: true,
          children: [{ path: '/ws/docs/chapters/ch1.md', is_dir: false, modified: 1 }],
        },
      ],
    },
  ]

  const visibleTreeCalls = []
  let readDirCalls = 0

  const runtime = createVisibleTreeRefreshRuntime({
    getWorkspacePath: () => '/ws',
    getCurrentTree: () => currentTree,
    findCurrentEntry: () => null,
    readDirShallow: async () => {
      readDirCalls += 1
      return []
    },
    readVisibleTree: async (workspacePath, loadedDirs) => {
      visibleTreeCalls.push({ workspacePath, loadedDirs })
      return [
        {
          path: '/ws/docs',
          is_dir: true,
          children: [
            {
              path: '/ws/docs/chapters',
              is_dir: true,
              children: [{ path: '/ws/docs/chapters/ch2.md', is_dir: false, modified: 2 }],
            },
          ],
        },
      ]
    },
    applyTree: (nextTree) => {
      currentTree = nextTree
    },
    setLastLoadError: (error) => {
      assert.equal(error, null)
    },
    beginReconcile: () => {},
    finishReconcile: () => {},
    failReconcile: () => {
      throw new Error('refresh should not fail in this test')
    },
  })

  await runtime.refreshVisibleTree({ reason: 'watch', suppressErrors: true })

  assert.equal(readDirCalls, 0)
  assert.deepEqual(visibleTreeCalls, [
    {
      workspacePath: '/ws',
      loadedDirs: ['/ws/docs', '/ws/docs/chapters'],
    },
  ])
  assert.deepEqual(currentTree, [
    {
      path: '/ws/docs',
      is_dir: true,
      children: [
        {
          path: '/ws/docs/chapters',
          is_dir: true,
          children: [{ path: '/ws/docs/chapters/ch2.md', is_dir: false, modified: 2 }],
        },
      ],
    },
  ])
})

test('refreshVisibleTree can hydrate tree and flat files from one workspace snapshot', async () => {
  let currentTree = [
    {
      path: '/ws/docs',
      is_dir: true,
      children: [{ path: '/ws/docs/old.md', is_dir: false }],
    },
  ]

  const snapshotCalls = []
  let visibleTreeCalls = 0
  let appliedSnapshot = null

  const runtime = createVisibleTreeRefreshRuntime({
    getWorkspacePath: () => '/ws',
    getCurrentTree: () => currentTree,
    findCurrentEntry: () => null,
    readDirShallow: async () => {
      throw new Error('readDirShallow should not be called')
    },
    readVisibleTree: async () => {
      visibleTreeCalls += 1
      return []
    },
    readWorkspaceSnapshot: async (workspacePath, loadedDirs) => {
      snapshotCalls.push({ workspacePath, loadedDirs })
      return {
        tree: [
          {
            path: '/ws/docs',
            is_dir: true,
            children: [{ path: '/ws/docs/new.md', is_dir: false }],
          },
        ],
        flatFiles: [{ path: '/ws/docs/new.md', is_dir: false }],
      }
    },
    applyWorkspaceSnapshot: (snapshot) => {
      appliedSnapshot = snapshot
      currentTree = snapshot.tree
    },
    applyTree: () => {
      throw new Error('applyTree should not be called')
    },
    setLastLoadError: (error) => {
      assert.equal(error, null)
    },
    beginReconcile: () => {},
    finishReconcile: () => {},
    failReconcile: () => {
      throw new Error('refresh should not fail in this test')
    },
  })

  await runtime.refreshVisibleTree({ reason: 'watch', suppressErrors: true })

  assert.equal(visibleTreeCalls, 0)
  assert.deepEqual(snapshotCalls, [
    {
      workspacePath: '/ws',
      loadedDirs: ['/ws/docs'],
    },
  ])
  assert.deepEqual(appliedSnapshot, {
    tree: [
      {
        path: '/ws/docs',
        is_dir: true,
        children: [{ path: '/ws/docs/new.md', is_dir: false }],
      },
    ],
    flatFiles: [{ path: '/ws/docs/new.md', is_dir: false }],
  })
})
