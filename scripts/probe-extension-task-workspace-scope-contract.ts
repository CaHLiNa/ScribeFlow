import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { createLogger, createServer } from 'vite'

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
        if (rendered.includes('WebSocket server error:')) {
          return
        }
        console.error(message, ...rest)
      },
    },
  }),
})

try {
  const { useExtensionsStore } = await vite.ssrLoadModule('/src/stores/extensions.ts')
  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.ts')
  const pinia = createPinia()
  setActivePinia(pinia)

  const workspace = useWorkspaceStore(pinia)
  workspace.path = '/tmp/workspace-b'

  const extensions = useExtensionsStore(pinia)

  extensions.upsertTask({
    id: 'task-workspace-a-running',
    extensionId: 'example-pdf-extension',
    workspaceRoot: '/tmp/workspace-a',
    state: 'running',
    createdAt: '2026-05-02T10:00:00Z',
    target: { kind: 'pdf', path: '/tmp/workspace-a/paper-a.pdf' },
  })
  extensions.upsertTask({
    id: 'task-workspace-a-succeeded',
    extensionId: 'example-pdf-extension',
    workspaceRoot: '/tmp/workspace-a',
    state: 'succeeded',
    createdAt: '2026-05-02T09:00:00Z',
    finishedAt: '2026-05-02T09:05:00Z',
    target: { kind: 'pdf', path: '/tmp/workspace-a/paper-a-complete.pdf' },
  })
  extensions.upsertTask({
    id: 'task-workspace-b-running',
    extensionId: 'example-pdf-extension',
    workspaceRoot: '/tmp/workspace-b',
    state: 'running',
    createdAt: '2026-05-02T11:00:00Z',
    target: { kind: 'pdf', path: '/tmp/workspace-b/paper-b.pdf' },
  })
  extensions.upsertTask({
    id: 'task-other-extension',
    extensionId: 'other-extension',
    workspaceRoot: '/tmp/workspace-b',
    state: 'running',
    createdAt: '2026-05-02T11:30:00Z',
    target: { kind: 'pdf', path: '/tmp/workspace-b/other.pdf' },
  })

  const timeline = extensions.taskTimelineForExtension('example-pdf-extension')

  assert.deepEqual(
    timeline.running.map((task) => task.id),
    ['task-workspace-b-running'],
  )
  assert.deepEqual(timeline.recent.map((task) => task.id), [])
  assert.equal(timeline.running[0].workspaceRoot, '/tmp/workspace-b')

  console.log(JSON.stringify({
    ok: true,
    summary: {
      currentWorkspaceRoot: workspace.path,
      runningTaskIds: timeline.running.map((task) => task.id),
      recentTaskIds: timeline.recent.map((task) => task.id),
      runningWorkspaceRoots: timeline.running.map((task) => task.workspaceRoot),
    },
  }, null, 2))
} finally {
  await vite.close()
}
