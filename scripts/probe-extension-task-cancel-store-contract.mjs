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
    if (cmd === 'extension_task_cancel') {
      return {
        id: 'task-running',
        extensionId: 'example-pdf-extension',
        workspaceRoot: '/tmp/workspace',
        capability: 'scribeflow.pdf.translate',
        commandId: 'scribeflow.pdf.translate',
        state: 'cancelled',
        createdAt: '2026-05-02T10:00:00Z',
        startedAt: '2026-05-02T10:00:05Z',
        finishedAt: '2026-05-02T10:01:00Z',
        target: { kind: 'pdf', path: '/tmp/paper-a.pdf' },
        progress: { label: 'Cancelled', current: 1, total: 2 },
        outputs: [
          {
            id: 'summary:running',
            type: 'inlineText',
            mediaType: 'text/plain',
            title: 'Running Summary',
            text: 'worker active',
          },
        ],
        artifacts: [],
        error: '',
        logPath: '/tmp/cancelled-task.log',
      }
    }
    if (cmd === 'extension_task_list') {
      return []
    }
    if (cmd === 'extension_artifact_open') {
      return { ok: true }
    }
    throw new Error(`Unexpected IPC command: ${cmd}`)
  }, { shouldMockEvents: true })

  const { useExtensionsStore } = await vite.ssrLoadModule('/src/stores/extensions.js')
  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.js')
  const { buildExtensionTaskResultEntries } = await vite.ssrLoadModule('/src/domains/extensions/extensionResultEntries.js')

  const pinia = createPinia()
  setActivePinia(pinia)
  const workspace = useWorkspaceStore(pinia)
  workspace.path = '/tmp/workspace'
  const extensions = useExtensionsStore(pinia)
  const executedCommands = []
  extensions.executeCommand = async (action = {}, target = {}, settings = {}) => {
    executedCommands.push({
      extensionId: String(action.extensionId || ''),
      commandId: String(action.commandId || ''),
      target,
      settings,
    })
    return { ok: true }
  }

  extensions.upsertTask({
    id: 'task-succeeded',
    extensionId: 'example-pdf-extension',
    workspaceRoot: '/tmp/workspace',
    state: 'succeeded',
    createdAt: '2026-05-02T09:00:00Z',
    finishedAt: '2026-05-02T09:05:00Z',
    target: { kind: 'pdf', path: '/tmp/paper-c.pdf' },
    artifacts: [],
    outputs: [],
    logPath: '/tmp/task.log',
  })
  extensions.upsertTask({
    id: 'task-running',
    extensionId: 'example-pdf-extension',
    workspaceRoot: '/tmp/workspace',
    capability: 'scribeflow.pdf.translate',
    commandId: 'scribeflow.pdf.translate',
    state: 'running',
    createdAt: '2026-05-02T10:00:00Z',
    startedAt: '2026-05-02T10:00:05Z',
    target: { kind: 'pdf', path: '/tmp/paper-a.pdf' },
    outputs: [
      {
        id: 'summary:running',
        type: 'inlineText',
        mediaType: 'text/plain',
        title: 'Running Summary',
        text: 'worker active',
      },
    ],
    artifacts: [],
    logPath: '/tmp/running-task.log',
  })

  const beforeTimeline = extensions.taskTimelineForExtension('example-pdf-extension')
  assert.deepEqual(beforeTimeline.running.map((task) => task.id), ['task-running'])
  assert.deepEqual(beforeTimeline.recent.map((task) => task.id), ['task-succeeded'])

  const cancelledTask = await extensions.cancelTask('task-running')
  const afterTimeline = extensions.taskTimelineForExtension('example-pdf-extension')

  assert.equal(cancelledTask?.state, 'cancelled')
  assert.equal(cancelledTask?.progress?.label, 'Cancelled')
  assert.equal(cancelledTask?.finishedAt, '2026-05-02T10:01:00Z')
  assert.equal(cancelledTask?.outputs?.[0]?.text, 'worker active')

  assert.deepEqual(afterTimeline.running.map((task) => task.id), [])
  assert.deepEqual(afterTimeline.recent.map((task) => task.id), ['task-running', 'task-succeeded'])
  assert.equal(afterTimeline.recent[0].state, 'cancelled')
  assert.equal(afterTimeline.recent[0].progress.label, 'Cancelled')
  assert.equal(afterTimeline.recent[0].outputs[0]?.text, 'worker active')
  assert.equal(afterTimeline.recent[0].logPath, '/tmp/cancelled-task.log')

  const cancelledEntries = buildExtensionTaskResultEntries(afterTimeline.recent[0])
  assert.deepEqual(
    cancelledEntries.map((entry) => [entry.id, entry.action, entry.previewMode, entry.previewTitle || '']),
    [
      ['summary:running', 'open', 'text', 'Running Summary'],
      ['task-running:log', 'open', 'text', 'Task Log'],
      ['task-running:rerun', 'execute-command', undefined, ''],
    ],
  )

  await extensions.runResultEntryAction(cancelledEntries.find((entry) => entry.id === 'task-running:log'), afterTimeline.recent[0].target)
  await extensions.runResultEntryAction(cancelledEntries.find((entry) => entry.id === 'task-running:rerun'), afterTimeline.recent[0].target)

  assert.ok(
    ipcCalls.some(([cmd, args]) =>
      cmd === 'extension_task_cancel' &&
      args?.params?.taskId === 'task-running'
    ),
  )
  assert.ok(
    ipcCalls.some(([cmd, args]) =>
      cmd === 'extension_artifact_open' &&
      args?.params?.path === '/tmp/cancelled-task.log'
    ),
  )
  assert.deepEqual(executedCommands, [
    {
      extensionId: 'example-pdf-extension',
      commandId: 'scribeflow.pdf.translate',
      target: { kind: 'pdf', referenceId: '', path: '/tmp/paper-a.pdf' },
      settings: {},
    },
  ])

  console.log(JSON.stringify({
    ok: true,
    summary: {
      cancelledTaskState: cancelledTask.state,
      cancelledProgressLabel: cancelledTask.progress.label,
      recentTaskIds: afterTimeline.recent.map((task) => task.id),
      preservedOutputText: afterTimeline.recent[0].outputs[0]?.text || '',
      cancelledEntryIds: cancelledEntries.map((entry) => entry.id),
      rerunCommandId: executedCommands[0]?.commandId || '',
    },
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
}
