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
    if (cmd === 'plugin:clipboard-manager|write_text') {
      return null
    }
    if (cmd === 'extension_artifact_open') {
      return {
        ok: true,
        path: args?.params?.path || '',
      }
    }
    if (cmd === 'extension_task_list') {
      return []
    }
    throw new Error(`Unexpected IPC command: ${cmd}`)
  }, { shouldMockEvents: true })

  const { useExtensionsStore } = await vite.ssrLoadModule('/src/stores/extensions.ts')
  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.ts')

  const pinia = createPinia()
  setActivePinia(pinia)
  const workspace = useWorkspaceStore(pinia)
  workspace.path = '/tmp/workspace'
  const extensions = useExtensionsStore(pinia)

  extensions.enabledExtensionIds = ['example-pdf-extension']
  extensions.registry = [{
    id: 'example-pdf-extension',
    name: 'Example PDF Extension',
    status: 'available',
    contributedCommands: [
      {
        commandId: 'scribeflow.pdf.translate',
        title: 'Translate',
      },
    ],
    contributedMenus: [],
    contributedKeybindings: [],
    contributedViewContainers: [],
    contributedViews: [],
    contributedViewTitleMenus: [],
    contributedViewItemMenus: [],
    contributedCapabilities: [],
    capabilities: [],
    settingsSchema: {},
    warnings: [],
    errors: [],
  }]

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

  const failedTask = extensions.upsertTask({
    id: 'task-failed',
    extensionId: 'example-pdf-extension',
    workspaceRoot: '/tmp/workspace',
    capability: 'scribeflow.pdf.translate',
    commandId: 'scribeflow.pdf.translate',
    state: 'failed',
    createdAt: '2026-05-02T10:00:00Z',
    startedAt: '2026-05-02T10:00:05Z',
    finishedAt: '2026-05-02T10:01:00Z',
    target: {
      kind: 'pdf',
      referenceId: 'ref-123',
      path: '/tmp/paper-a.pdf',
    },
    settings: {
      'examplePdfExtension.targetLang': 'zh-CN',
    },
    progress: {
      label: 'Worker failed',
      current: 1,
      total: 1,
    },
    outputs: [
      {
        id: 'failure-summary',
        type: 'inlineText',
        mediaType: 'text/plain',
        title: 'Failure Summary',
        text: 'worker stderr: boom',
      },
    ],
    artifacts: [
      {
        id: 'failure-log',
        kind: 'log',
        mediaType: 'text/plain',
        path: '/tmp/failure.log',
      },
    ],
    error: 'worker exited with code 7',
    logPath: '/tmp/extension-task.log',
  })

  const timeline = extensions.taskTimelineForExtension('example-pdf-extension')
  assert.deepEqual(timeline.running.map((task) => task.id), [])
  assert.deepEqual(timeline.recent.map((task) => task.id), ['task-failed'])

  const resultEntries = extensions
    ? (await vite.ssrLoadModule('/src/domains/extensions/extensionResultEntries.ts'))
        .buildExtensionTaskResultEntries(failedTask)
    : []

  assert.deepEqual(
    resultEntries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      previewMode: entry.previewMode,
      previewTitle: entry.previewTitle || '',
    })),
    [
      {
        id: 'failure-log',
        action: 'open',
        previewMode: 'text',
        previewTitle: 'Log',
      },
      {
        id: 'failure-summary',
        action: 'open',
        previewMode: 'text',
        previewTitle: 'Failure Summary',
      },
      {
        id: 'task-failed:log',
        action: 'open',
        previewMode: 'text',
        previewTitle: 'Task Log',
      },
      {
        id: 'task-failed:rerun',
        action: 'execute-command',
        previewMode: undefined,
        previewTitle: '',
      },
    ],
  )

  const summaryEntry = resultEntries.find((entry) => entry.id === 'failure-summary')
  const artifactEntry = resultEntries.find((entry) => entry.id === 'failure-log')
  const taskLogEntry = resultEntries.find((entry) => entry.id === 'task-failed:log')
  const rerunEntry = resultEntries.find((entry) => entry.id === 'task-failed:rerun')

  await extensions.runResultEntryAction(summaryEntry, failedTask.target)
  await extensions.runResultEntryAction(artifactEntry, failedTask.target)
  await extensions.runResultEntryAction(taskLogEntry, failedTask.target)
  await extensions.runResultEntryAction(rerunEntry, failedTask.target)

  assert.ok(
    ipcCalls.some(([cmd, args]) =>
      cmd === 'extension_artifact_open' &&
      args?.params?.path === '/tmp/failure.log'
    ),
  )
  assert.ok(
    ipcCalls.some(([cmd, args]) =>
      cmd === 'extension_artifact_open' &&
      args?.params?.path === '/tmp/extension-task.log'
    ),
  )
  assert.deepEqual(executedCommands, [
    {
      extensionId: 'example-pdf-extension',
      commandId: 'scribeflow.pdf.translate',
      target: {
        kind: 'pdf',
        referenceId: 'ref-123',
        path: '/tmp/paper-a.pdf',
      },
      settings: {
        'examplePdfExtension.targetLang': 'zh-CN',
      },
    },
  ])

  console.log(JSON.stringify({
    ok: true,
    summary: {
      recentTaskIds: timeline.recent.map((task) => task.id),
      resultEntryIds: resultEntries.map((entry) => entry.id),
      failurePreviewTitle: summaryEntry?.previewTitle || '',
      rerunCommandId: executedCommands[0]?.commandId || '',
    },
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
}
