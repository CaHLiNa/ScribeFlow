import assert from 'node:assert/strict'
import { createPinia } from 'pinia'
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
  const workspace = useWorkspaceStore(pinia)
  workspace.path = '/tmp/workspace'
  const extensions = useExtensionsStore(pinia)

  extensions.upsertTask({
    id: 'task-other-extension',
    extensionId: 'other-extension',
    workspaceRoot: '/tmp/workspace',
    state: 'running',
    created_at: '2026-05-02T08:00:00Z',
    target: { kind: 'pdf', path: '/tmp/other.pdf' },
  })
  for (let index = 0; index < 9; index += 1) {
    extensions.upsertTask({
      id: `task-older-${index}`,
      extensionId: 'example-pdf-extension',
      workspaceRoot: '/tmp/workspace',
      state: 'succeeded',
      created_at: `2026-05-02T0${index}:00:00Z`,
      finished_at: `2026-05-02T0${index}:05:00Z`,
      target: { kind: 'pdf', path: `/tmp/older-${index}.pdf` },
    })
  }
  extensions.upsertTask({
    id: 'task-succeeded',
    extensionId: 'example-pdf-extension',
    workspaceRoot: '/tmp/workspace',
    state: 'succeeded',
    created_at: '2026-05-02T09:00:00Z',
    finished_at: '2026-05-02T09:05:00Z',
    target: { kind: 'pdf', path: '/tmp/paper-c.pdf' },
    artifacts: [{ id: 'artifact', path: '/tmp/paper-c.txt' }],
    log_path: '/tmp/task.log',
  })
  extensions.upsertTask({
    id: 'task-queued',
    extensionId: 'example-pdf-extension',
    workspaceRoot: '/tmp/workspace',
    state: 'queued',
    created_at: '2026-05-02T09:59:00Z',
    target: { kind: 'pdf', path: '/tmp/paper-b.pdf' },
    artifacts: [],
  })
  extensions.upsertTask({
    id: 'task-running',
    extensionId: 'example-pdf-extension',
    workspaceRoot: '/tmp/workspace',
    state: 'running',
    createdAt: '2026-05-02T10:00:00Z',
    startedAt: '2026-05-02T10:00:05Z',
    target: { kind: 'pdf', path: '/tmp/paper-a.pdf' },
    artifacts: [],
  })

  const timeline = extensions.taskTimelineForExtension('example-pdf-extension')
  assert.deepEqual(
    timeline.running.map((task) => task.id),
    ['task-running', 'task-queued'],
  )
  assert.deepEqual(
    timeline.recent.map((task) => task.id),
    [
      'task-succeeded',
      'task-older-8',
      'task-older-7',
      'task-older-6',
      'task-older-5',
      'task-older-4',
      'task-older-3',
      'task-older-2',
    ],
  )
  assert.equal(timeline.recentLimit, 8)
  assert.equal(timeline.recentCompactLimit, 8)
  assert.equal(timeline.recentVisibleCount, 8)
  assert.equal(timeline.recentTotalCount, 10)
  assert.equal(timeline.recentHiddenCount, 2)

  const expandedTimeline = extensions.taskTimelineForExtension('example-pdf-extension', undefined, {
    recentLimit: Number.MAX_SAFE_INTEGER,
  })
  assert.deepEqual(
    expandedTimeline.recent.map((task) => task.id),
    [
      'task-succeeded',
      'task-older-8',
      'task-older-7',
      'task-older-6',
      'task-older-5',
      'task-older-4',
      'task-older-3',
      'task-older-2',
      'task-older-1',
      'task-older-0',
    ],
  )
  assert.equal(expandedTimeline.recentVisibleCount, 10)
  assert.equal(expandedTimeline.recentTotalCount, 10)
  assert.equal(expandedTimeline.recentHiddenCount, 0)

  assert.equal(timeline.running[0].createdAt, '2026-05-02T10:00:00Z')
  assert.equal(timeline.running[0].startedAt, '2026-05-02T10:00:05Z')
  assert.equal(timeline.running[1].createdAt, '2026-05-02T09:59:00Z')
  assert.equal(timeline.recent[0].finishedAt, '2026-05-02T09:05:00Z')
  assert.equal(timeline.recent[0].logPath, '/tmp/task.log')
  assert.equal(timeline.recent[0].target.path, '/tmp/paper-c.pdf')
  assert.equal(timeline.recent.at(-1).id, 'task-older-2')

  console.log(JSON.stringify({
    ok: true,
    timeline: {
      running: timeline.running.map((task) => ({
        id: task.id,
        createdAt: task.createdAt,
        startedAt: task.startedAt,
      })),
      recent: timeline.recent.map((task) => ({
        id: task.id,
        finishedAt: task.finishedAt,
        logPath: task.logPath,
      })),
      recentHiddenCount: timeline.recentHiddenCount,
      recentTotalCount: timeline.recentTotalCount,
      expandedRecentCount: expandedTimeline.recentVisibleCount,
    },
  }, null, 2))
} finally {
  await vite.close()
}
