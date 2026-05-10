import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { createPinia, setActivePinia } from 'pinia'
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
        if (rendered.includes('WebSocket server error:')) {
          return
        }
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

  const ipcCalls = []
  mockIPC((cmd, args) => {
    ipcCalls.push([cmd, args])
    if (cmd === 'extension_task_list') {
      const workspaceRoot = String(args?.params?.workspaceRoot || '')
      if (workspaceRoot === '/tmp/workspace-b') {
        return [
          {
            id: 'task-workspace-b-running',
            extensionId: 'example-pdf-extension',
            workspaceRoot: '/tmp/workspace-b',
            state: 'running',
            createdAt: '2026-05-02T11:00:00Z',
            target: { kind: 'pdf', path: '/tmp/workspace-b/paper-b.pdf' },
          },
        ]
      }
      return [
        {
          id: 'task-workspace-a-running',
          extensionId: 'example-pdf-extension',
          workspaceRoot: '/tmp/workspace-a',
          state: 'running',
          createdAt: '2026-05-02T10:00:00Z',
          target: { kind: 'pdf', path: '/tmp/workspace-a/paper-a.pdf' },
        },
      ]
    }
    throw new Error(`Unexpected IPC command: ${cmd}`)
  }, { shouldMockEvents: true })

  const { useExtensionsStore } = await vite.ssrLoadModule('/src/stores/extensions.js')
  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.js')

  const pinia = createPinia()
  setActivePinia(pinia)

  const workspace = useWorkspaceStore(pinia)
  workspace.path = '/tmp/workspace-b'

  const extensions = useExtensionsStore(pinia)
  const tasks = await extensions.refreshTasks()

  assert.deepEqual(tasks.map((task) => task.id), ['task-workspace-b-running'])
  assert.deepEqual(tasks.map((task) => task.workspaceRoot), ['/tmp/workspace-b'])
  assert.ok(
    ipcCalls.some(([cmd, args]) =>
      cmd === 'extension_task_list' &&
      String(args?.params?.workspaceRoot || '') === '/tmp/workspace-b'
    ),
  )

  console.log(JSON.stringify({
    ok: true,
    summary: {
      requestedWorkspaceRoot: '/tmp/workspace-b',
      returnedTaskIds: tasks.map((task) => task.id),
      returnedWorkspaceRoots: tasks.map((task) => task.workspaceRoot),
    },
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
}
