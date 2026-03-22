import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createVisibleTreeRefreshRuntime,
  mergePreservingLoadedChildren,
  patchTreeEntry,
} from '../src/domains/files/fileTreeRefreshRuntime.js'

test('mergePreservingLoadedChildren keeps previously loaded nested children', () => {
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

  assert.deepEqual(mergePreservingLoadedChildren(next, previous), [
    {
      path: '/ws/docs',
      is_dir: true,
      children: [
        { path: '/ws/docs/chapter1.md', is_dir: false },
      ],
    },
  ])
})

test('patchTreeEntry updates a nested directory entry in place', () => {
  const tree = [
    {
      path: '/ws/docs',
      is_dir: true,
      children: [
        { path: '/ws/docs/chapter1.md', is_dir: false },
      ],
    },
  ]

  const patched = patchTreeEntry(tree, '/ws/docs', (entry) => ({
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
