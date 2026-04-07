import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createFileTreeHydrationRuntime,
  findTreeEntry,
} from '../src/domains/files/fileTreeHydrationRuntime.js'

test('findTreeEntry resolves nested file entries', () => {
  const tree = [
    {
      path: '/ws/docs',
      is_dir: true,
      children: [
        {
          path: '/ws/docs/chapter1.md',
          is_dir: false,
        },
      ],
    },
  ]

  assert.deepEqual(findTreeEntry(tree, '/ws/docs/chapter1.md'), {
    path: '/ws/docs/chapter1.md',
    is_dir: false,
  })
  assert.equal(findTreeEntry(tree, '/ws/missing.md'), null)
})

test('ensureDirLoaded coalesces concurrent loads for the same directory', async () => {
  let currentTree = [
    { path: '/ws/docs', is_dir: true },
  ]
  let readCalls = 0
  let releaseRead
  const readPromise = new Promise((resolve) => {
    releaseRead = resolve
  })

  const runtime = createFileTreeHydrationRuntime({
    getWorkspacePath: () => '/ws',
    getCurrentTree: () => currentTree,
    readDirShallow: async (path) => {
      assert.equal(path, '/ws/docs')
      readCalls += 1
      await readPromise
      return [
        { path: '/ws/docs/chapter1.md', is_dir: false },
      ]
    },
    applyTree: (nextTree) => {
      currentTree = nextTree
    },
  })

  const firstLoad = runtime.ensureDirLoaded('/ws/docs')
  const secondLoad = runtime.ensureDirLoaded('/ws/docs')
  releaseRead()

  const [firstResult, secondResult] = await Promise.all([firstLoad, secondLoad])

  assert.equal(readCalls, 1)
  assert.deepEqual(firstResult, [
    { path: '/ws/docs/chapter1.md', is_dir: false },
  ])
  assert.deepEqual(secondResult, firstResult)
  assert.deepEqual(currentTree, [
    {
      path: '/ws/docs',
      is_dir: true,
      children: [
        { path: '/ws/docs/chapter1.md', is_dir: false },
      ],
    },
  ])
})

test('ensureDirLoaded can load a directory through rust-backed visible tree snapshots', async () => {
  let currentTree = [{ path: '/ws/docs', is_dir: true }]
  const visibleTreeCalls = []
  let shallowCalls = 0

  const runtime = createFileTreeHydrationRuntime({
    getWorkspacePath: () => '/ws',
    getCurrentTree: () => currentTree,
    readDirShallow: async () => {
      shallowCalls += 1
      return []
    },
    readVisibleTree: async (workspacePath, loadedDirs) => {
      visibleTreeCalls.push({ workspacePath, loadedDirs })
      return [
        {
          path: '/ws/docs',
          is_dir: true,
          children: [{ path: '/ws/docs/chapter1.md', is_dir: false }],
        },
      ]
    },
    applyTree: (nextTree) => {
      currentTree = nextTree
    },
  })

  const children = await runtime.ensureDirLoaded('/ws/docs')

  assert.equal(shallowCalls, 0)
  assert.deepEqual(visibleTreeCalls, [
    {
      workspacePath: '/ws',
      loadedDirs: ['/ws/docs'],
    },
  ])
  assert.deepEqual(children, [{ path: '/ws/docs/chapter1.md', is_dir: false }])
  assert.deepEqual(currentTree, [
    {
      path: '/ws/docs',
      is_dir: true,
      children: [{ path: '/ws/docs/chapter1.md', is_dir: false }],
    },
  ])
})

test('loadFileTree uses rust-backed visible tree snapshots when available', async () => {
  let currentTree = [
    {
      path: '/ws/docs',
      is_dir: true,
      children: [{ path: '/ws/docs/old.md', is_dir: false }],
    },
  ]
  const visibleTreeCalls = []
  let shallowCalls = 0
  let lastError = 'unreached'

  const runtime = createFileTreeHydrationRuntime({
    getWorkspacePath: () => '/ws',
    getCurrentTree: () => currentTree,
    readDirShallow: async () => {
      shallowCalls += 1
      return []
    },
    readVisibleTree: async (workspacePath, loadedDirs) => {
      visibleTreeCalls.push({ workspacePath, loadedDirs })
      return [
        {
          path: '/ws/docs',
          is_dir: true,
        },
        { path: '/ws/notes.md', is_dir: false },
      ]
    },
    applyTree: (nextTree) => {
      currentTree = nextTree
    },
    setLastLoadError: (error) => {
      lastError = error
    },
  })

  const nextTree = await runtime.loadFileTree()

  assert.equal(shallowCalls, 0)
  assert.equal(lastError, null)
  assert.deepEqual(visibleTreeCalls, [
    {
      workspacePath: '/ws',
      loadedDirs: [],
    },
  ])
  assert.deepEqual(nextTree, [
    {
      path: '/ws/docs',
      is_dir: true,
      children: [{ path: '/ws/docs/old.md', is_dir: false }],
    },
    { path: '/ws/notes.md', is_dir: false },
  ])
  assert.deepEqual(currentTree, nextTree)
})

test('loadFileTree can hydrate tree and flat files from one workspace snapshot', async () => {
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

  const runtime = createFileTreeHydrationRuntime({
    getWorkspacePath: () => '/ws',
    getCurrentTree: () => currentTree,
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
        tree: [{ path: '/ws/docs', is_dir: true }],
        flatFiles: [{ path: '/ws/chapter1.md', is_dir: false }],
      }
    },
    applyWorkspaceSnapshot: (snapshot) => {
      appliedSnapshot = snapshot
      currentTree = snapshot.tree
    },
    setLastLoadError: () => {},
  })

  await runtime.loadFileTree()

  assert.equal(visibleTreeCalls, 0)
  assert.deepEqual(snapshotCalls, [{ workspacePath: '/ws', loadedDirs: [] }])
  assert.deepEqual(appliedSnapshot, {
    tree: [
      {
        path: '/ws/docs',
        is_dir: true,
        children: [{ path: '/ws/docs/old.md', is_dir: false }],
      },
    ],
    flatFiles: [{ path: '/ws/chapter1.md', is_dir: false }],
  })
})

test('ensureDirLoaded prefers workspace snapshot over visible tree fallback when both exist', async () => {
  let currentTree = [{ path: '/ws/docs', is_dir: true }]
  const snapshotCalls = []
  let visibleTreeCalls = 0

  const runtime = createFileTreeHydrationRuntime({
    getWorkspacePath: () => '/ws',
    getCurrentTree: () => currentTree,
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
            children: [{ path: '/ws/docs/chapter1.md', is_dir: false }],
          },
        ],
        flatFiles: [{ path: '/ws/docs/chapter1.md', is_dir: false }],
      }
    },
    applyWorkspaceSnapshot: (snapshot) => {
      currentTree = snapshot.tree
    },
  })

  const children = await runtime.ensureDirLoaded('/ws/docs')

  assert.equal(visibleTreeCalls, 0)
  assert.deepEqual(snapshotCalls, [
    {
      workspacePath: '/ws',
      loadedDirs: ['/ws/docs'],
    },
  ])
  assert.deepEqual(children, [{ path: '/ws/docs/chapter1.md', is_dir: false }])
})

test('revealPath loads and expands ancestor directories for nested files', async () => {
  let currentTree = [
    { path: '/ws/docs', is_dir: true },
    { path: '/ws/docs/chapters', is_dir: true },
  ]
  const expanded = new Set()
  let snapshotCalls = 0
  const readCalls = []

  const runtime = createFileTreeHydrationRuntime({
    getWorkspacePath: () => '/ws',
    getCurrentTree: () => currentTree,
    readDirShallow: async (path) => {
      readCalls.push(path)
      return []
    },
    applyTree: (nextTree) => {
      currentTree = nextTree
    },
    addExpandedDir: (path) => expanded.add(path),
    cacheSnapshot: () => {
      snapshotCalls += 1
    },
  })

  await runtime.revealPath('/ws/docs/chapters/chapter1.md')

  assert.deepEqual(readCalls, ['/ws/docs', '/ws/docs/chapters'])
  assert.deepEqual([...expanded], ['/ws/docs', '/ws/docs/chapters'])
  assert.equal(snapshotCalls, 1)
})

test('revealPath uses rust-backed visible tree snapshots for ancestor expansion', async () => {
  let currentTree = [
    { path: '/ws/docs', is_dir: true },
    { path: '/ws/docs/chapters', is_dir: true },
  ]
  const expanded = new Set()
  const visibleTreeCalls = []
  let shallowCalls = 0
  let snapshotCalls = 0

  const runtime = createFileTreeHydrationRuntime({
    getWorkspacePath: () => '/ws',
    getCurrentTree: () => currentTree,
    readDirShallow: async () => {
      shallowCalls += 1
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
              children: [{ path: '/ws/docs/chapters/chapter1.md', is_dir: false }],
            },
          ],
        },
      ]
    },
    applyTree: (nextTree) => {
      currentTree = nextTree
    },
    addExpandedDir: (path) => expanded.add(path),
    cacheSnapshot: () => {
      snapshotCalls += 1
    },
  })

  await runtime.revealPath('/ws/docs/chapters/chapter1.md')

  assert.equal(shallowCalls, 0)
  assert.deepEqual(visibleTreeCalls, [
    {
      workspacePath: '/ws',
      loadedDirs: ['/ws/docs', '/ws/docs/chapters'],
    },
  ])
  assert.deepEqual([...expanded], ['/ws/docs', '/ws/docs/chapters'])
  assert.equal(snapshotCalls, 1)
  assert.deepEqual(currentTree, [
    {
      path: '/ws/docs',
      is_dir: true,
      children: [
        {
          path: '/ws/docs/chapters',
          is_dir: true,
          children: [{ path: '/ws/docs/chapters/chapter1.md', is_dir: false }],
        },
      ],
    },
  ])
})

test('syncTreeAfterMutation refreshes tree, reloads expanded directory, and invalidates flat files', async () => {
  let currentTree = [
    { path: '/ws/docs', is_dir: true },
  ]
  const expanded = new Set()
  const refreshReasons = []
  const applyCalls = []
  let invalidations = 0
  let snapshotCalls = 0

  const runtime = createFileTreeHydrationRuntime({
    getWorkspacePath: () => '/ws',
    getCurrentTree: () => currentTree,
    readDirShallow: async (path) => {
      assert.equal(path, '/ws/docs')
      return [
        { path: '/ws/docs/chapter1.md', is_dir: false },
      ]
    },
    applyTree: (nextTree, workspacePath, options = {}) => {
      applyCalls.push({ workspacePath, options })
      currentTree = nextTree
    },
    refreshVisibleTree: async ({ reason }) => {
      refreshReasons.push(reason)
    },
    addExpandedDir: (path) => expanded.add(path),
    cacheSnapshot: () => {
      snapshotCalls += 1
    },
    invalidateFlatFiles: () => {
      invalidations += 1
    },
  })

  await runtime.syncTreeAfterMutation({ expandPath: '/ws/docs' })

  assert.deepEqual(refreshReasons, ['mutation'])
  assert.equal(invalidations, 1)
  assert.equal(snapshotCalls, 1)
  assert.deepEqual([...expanded], ['/ws/docs'])
  assert.deepEqual(applyCalls, [
    {
      workspacePath: '/ws',
      options: { preserveFlatFiles: true },
    },
  ])
  assert.deepEqual(currentTree, [
    {
      path: '/ws/docs',
      is_dir: true,
      children: [
        { path: '/ws/docs/chapter1.md', is_dir: false },
      ],
    },
  ])
})

test('syncTreeAfterMutation uses rust-backed visible tree snapshots when available', async () => {
  let currentTree = [{ path: '/ws/docs', is_dir: true }]
  const expanded = new Set()
  const visibleTreeCalls = []
  let refreshCalls = 0
  let invalidations = 0
  let snapshotCalls = 0
  const applyCalls = []

  const runtime = createFileTreeHydrationRuntime({
    getWorkspacePath: () => '/ws',
    getCurrentTree: () => currentTree,
    readDirShallow: async () => {
      throw new Error('readDirShallow should not be called')
    },
    readVisibleTree: async (workspacePath, loadedDirs) => {
      visibleTreeCalls.push({ workspacePath, loadedDirs })
      return [
        {
          path: '/ws/docs',
          is_dir: true,
          children: [{ path: '/ws/docs/chapter1.md', is_dir: false }],
        },
      ]
    },
    applyTree: (nextTree, workspacePath, options = {}) => {
      applyCalls.push({ workspacePath, options })
      currentTree = nextTree
    },
    refreshVisibleTree: async () => {
      refreshCalls += 1
    },
    addExpandedDir: (path) => expanded.add(path),
    cacheSnapshot: () => {
      snapshotCalls += 1
    },
    invalidateFlatFiles: () => {
      invalidations += 1
    },
  })

  await runtime.syncTreeAfterMutation({ expandPath: '/ws/docs' })

  assert.equal(refreshCalls, 0)
  assert.deepEqual(visibleTreeCalls, [
    {
      workspacePath: '/ws',
      loadedDirs: ['/ws/docs'],
    },
  ])
  assert.equal(invalidations, 1)
  assert.equal(snapshotCalls, 1)
  assert.deepEqual([...expanded], ['/ws/docs'])
  assert.deepEqual(applyCalls, [
    {
      workspacePath: '/ws',
      options: { preserveFlatFiles: true },
    },
  ])
  assert.deepEqual(currentTree, [
    {
      path: '/ws/docs',
      is_dir: true,
      children: [{ path: '/ws/docs/chapter1.md', is_dir: false }],
    },
  ])
})
