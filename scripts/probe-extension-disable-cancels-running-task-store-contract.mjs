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
    if (cmd === 'extension_settings_save') {
      return {
        settingsExists: true,
        enabledExtensionIds: args?.params?.settings?.enabledExtensionIds || [],
        extensionConfig: args?.params?.settings?.extensionConfig || {},
      }
    }
    if (cmd === 'extension_task_cancel_extension') {
      return [
        {
          id: 'task-running',
          extensionId: 'example-pdf-extension',
          workspaceRoot: '/tmp/workspace',
          capability: 'scribeflow.pdf.translate',
          commandId: 'scribeflow.pdf.translate',
          state: 'cancelled',
          createdAt: '2026-05-02T10:00:00Z',
          startedAt: '2026-05-02T10:00:05Z',
          finishedAt: '2026-05-02T10:02:00Z',
          target: { kind: 'pdf', path: '/tmp/paper-a.pdf', referenceId: 'ref-123' },
          progress: { label: 'Cancelled', current: 1, total: 1 },
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
          logPath: '/tmp/running-task.log',
        },
      ]
    }
    if (cmd === 'extension_host_deactivate') {
      return {
        extensionId: args?.params?.extensionId || '',
        accepted: true,
      }
    }
    if (cmd === 'extension_task_list') {
      return []
    }
    throw new Error(`Unexpected IPC command: ${cmd}`)
  }, { shouldMockEvents: true })

  const { useExtensionsStore } = await vite.ssrLoadModule('/src/stores/extensions.js')
  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.js')

  const pinia = createPinia()
  setActivePinia(pinia)

  const workspace = useWorkspaceStore(pinia)
  workspace.path = '/tmp/workspace'
  workspace.globalConfigDir = '/tmp/global-config'
  workspace.ensureGlobalConfigDir = async () => '/tmp/global-config'

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
        category: 'PDF',
      },
    ],
    contributedMenus: [],
    contributedKeybindings: [],
    contributedViewContainers: [
      {
        id: 'examplePdfExtension.tools',
        panelId: 'extension:examplePdfExtension.tools',
        title: 'PDF Tools',
      },
    ],
    contributedViews: [
      {
        id: 'examplePdfExtension.translateView',
        containerId: 'examplePdfExtension.tools',
        panelId: 'extension:examplePdfExtension.tools',
        title: 'Translate PDF',
        contextualTitle: '',
        when: '',
      },
    ],
    contributedViewTitleMenus: [],
    contributedViewItemMenus: [],
    contributedCapabilities: [
      {
        id: 'pdf.translate',
      },
    ],
    capabilities: ['pdf.translate'],
    settingsSchema: {},
    warnings: [],
    errors: [],
  }]

  extensions.runtimeRegistry['example-pdf-extension'] = {
    activated: true,
    registeredCommands: ['scribeflow.pdf.translate'],
    registeredCapabilities: ['pdf.translate'],
    registeredViews: ['examplePdfExtension.translateView'],
  }
  extensions.resolvedViews['example-pdf-extension:examplePdfExtension.translateView'] = {
    viewId: 'examplePdfExtension.translateView',
    items: [],
    parentItems: {},
  }
  extensions.viewState['example-pdf-extension:examplePdfExtension.translateView'] = {
    title: 'Translate PDF',
    resultEntries: [],
  }
  extensions.viewControllerState['example-pdf-extension:examplePdfExtension.translateView'] = {
    selectedHandle: 'translate-group',
    focusedHandle: '',
    revealedPathHandles: [],
  }
  extensions.changedViewTicks['example-pdf-extension:examplePdfExtension.translateView'] = 2
  extensions.sidebarTargets['extension:examplePdfExtension.tools'] = {
    kind: 'pdf',
    path: '/tmp/paper-a.pdf',
    referenceId: 'ref-123',
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
    target: { kind: 'pdf', path: '/tmp/paper-a.pdf', referenceId: 'ref-123' },
    progress: { label: 'Running', current: 0, total: 1 },
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
    logPath: '/tmp/running-task.log',
  })

  const beforeTimeline = extensions.taskTimelineForExtension('example-pdf-extension')
  assert.deepEqual(beforeTimeline.running.map((task) => task.id), ['task-running'])
  assert.deepEqual(beforeTimeline.recent.map((task) => task.id), ['task-succeeded'])

  const disabledSnapshot = await extensions.setExtensionEnabled('example-pdf-extension', false)
  const afterTimeline = extensions.taskTimelineForExtension('example-pdf-extension')

  assert.deepEqual(disabledSnapshot.enabledExtensionIds, [])
  assert.equal(extensions.isExtensionEnabled('example-pdf-extension'), false)
  assert.deepEqual(afterTimeline.running.map((task) => task.id), [])
  assert.deepEqual(afterTimeline.recent.map((task) => task.id), ['task-running', 'task-succeeded'])
  assert.equal(afterTimeline.recent[0].state, 'cancelled')
  assert.equal(afterTimeline.recent[0].progress.label, 'Cancelled')
  assert.equal(afterTimeline.recent[0].outputs[0]?.text, 'worker active')

  assert.equal(extensions.runtimeRegistry['example-pdf-extension'], undefined)
  assert.equal(extensions.resolvedViews['example-pdf-extension:examplePdfExtension.translateView'], undefined)
  assert.equal(extensions.viewState['example-pdf-extension:examplePdfExtension.translateView'], undefined)
  assert.equal(extensions.viewControllerState['example-pdf-extension:examplePdfExtension.translateView'], undefined)
  assert.equal(extensions.changedViewTicks['example-pdf-extension:examplePdfExtension.translateView'], undefined)
  assert.equal(extensions.sidebarTargets['extension:examplePdfExtension.tools'], undefined)

  assert.ok(
    ipcCalls.some(([cmd, args]) =>
      cmd === 'extension_task_cancel_extension' &&
      String(args?.params?.extensionId || '') === 'example-pdf-extension' &&
      String(args?.params?.workspaceRoot || '') === '/tmp/workspace'
    ),
  )
  assert.ok(
    ipcCalls.some(([cmd, args]) =>
      cmd === 'extension_host_deactivate' &&
      String(args?.params?.extensionId || '') === 'example-pdf-extension' &&
      String(args?.params?.workspaceRoot || '') === '/tmp/workspace'
    ),
  )

  console.log(JSON.stringify({
    ok: true,
    summary: {
      recentTaskIds: afterTimeline.recent.map((task) => task.id),
      cancelledTaskState: afterTimeline.recent[0].state,
      preservedOutputText: afterTimeline.recent[0].outputs[0]?.text || '',
      disableCancelledTaskCount: ipcCalls.filter(([cmd]) => cmd === 'extension_task_cancel_extension').length,
    },
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
}
