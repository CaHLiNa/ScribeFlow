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
        if (rendered.includes('WebSocket server error:')) return
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

  const trace = []
  mockIPC((cmd, args) => {
    trace.push(['ipc', cmd, args])
    if (cmd === 'extension_host_status') {
      return {
        available: true,
        runtime: 'node-extension-host-persistent',
        activatedExtensions: [],
        activeRuntimeSlots: [],
        pendingPromptOwner: null,
      }
    }
    if (cmd === 'extension_host_activate') {
      return {
        activated: true,
        reason: 'onCapability:scribeflow.pdf.translate',
        registeredCommands: [],
        registeredCapabilities: ['scribeflow.pdf.translate'],
        registeredViews: ['examplePdfExtension.translateView'],
        registeredCommandDetails: [],
        registeredMenuActions: [],
        registeredViewDetails: [{
          id: 'examplePdfExtension.translateView',
          title: 'Translate PDF',
          when: 'resourceExtname == .pdf || resource.kind == pdf',
        }],
      }
    }
    if (cmd === 'extension_capability_invoke') {
      return {
        task: {
          id: 'task-capability-route',
          extensionId: args?.params?.extensionId,
          workspaceRoot: args?.params?.workspaceRoot,
          capability: args?.params?.capabilityId,
          commandId: '',
          state: 'running',
          progress: {
            label: 'Routing verified',
            current: 1,
            total: 2,
          },
          target: args?.params?.target,
          artifacts: [],
          outputs: [],
          error: '',
          logPath: '',
        },
        changedViews: ['examplePdfExtension.translateView'],
        resultEntries: [{
          id: 'capability-route-summary',
          label: 'Capability Route Summary',
          action: 'copy-text',
          payload: { text: 'capability routed into sidebar' },
        }],
      }
    }
    throw new Error(`Unexpected IPC command: ${cmd}`)
  }, { shouldMockEvents: true })

  const { useExtensionsStore } = await vite.ssrLoadModule('/src/stores/extensions.js')
  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.js')

  const pinia = createPinia()
  setActivePinia(pinia)

  const workspace = useWorkspaceStore(pinia)
  workspace.primarySurface = 'settings'
  workspace.leftSidebarPanel = 'references'
  workspace.path = '/tmp/workspace'
  workspace.ensureGlobalConfigDir = async () => '/tmp/global-config'
  workspace.openWorkspaceSurface = async () => {
    trace.push(['workspace', 'openWorkspaceSurface'])
    workspace.primarySurface = 'workspace'
  }
  workspace.setLeftSidebarPanel = async (panel) => {
    trace.push(['workspace', 'setLeftSidebarPanel', panel])
    workspace.leftSidebarPanel = String(panel || '')
  }
  workspace.openDocumentDock = async () => {
    trace.push(['workspace', 'openDocumentDock'])
    workspace.documentDockOpen = true
  }
  workspace.setDocumentDockActivePage = async (page) => {
    trace.push(['workspace', 'setDocumentDockActivePage', page])
    workspace.documentDockActivePage = String(page || '')
  }

  const extensions = useExtensionsStore(pinia)
  extensions.enabledExtensionIds = ['example-pdf-extension']
  extensions.registry = [{
    id: 'example-pdf-extension',
    name: 'Example PDF Extension',
    status: 'available',
    contributedCapabilities: [
      { id: 'scribeflow.pdf.translate' },
    ],
    capabilities: ['scribeflow.pdf.translate'],
    contributedCommands: [],
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
        presentation: 'documentAction',
        when: 'resourceExtname == .pdf || resource.kind == pdf',
      },
    ],
    contributedViewTitleMenus: [],
    contributedViewItemMenus: [],
    settingsSchema: {},
    warnings: [],
    errors: [],
  }]

  const target = {
    kind: 'pdf',
    referenceId: 'ref-123',
    path: '/tmp/workspace/paper.pdf',
  }

  const task = await extensions.invokeCapability({
    extensionId: 'example-pdf-extension',
    capabilityId: 'scribeflow.pdf.translate',
  }, target)

  assert.equal(task.id, 'task-capability-route')
  assert.equal(task.capability, 'scribeflow.pdf.translate')
  assert.deepEqual(task.target, target)
  assert.deepEqual(extensions.sidebarTargetForPanel('extension:examplePdfExtension.tools'), target)
  assert.equal(workspace.primarySurface, 'workspace')
  assert.equal(workspace.leftSidebarPanel, 'files')
  assert.equal(workspace.documentDockOpen, true)
  assert.equal(workspace.documentDockActivePage, 'extension:examplePdfExtension.tools')
  assert.equal(extensions.viewRefreshTickFor('example-pdf-extension:examplePdfExtension.translateView'), 1)

  const activateIndex = trace.findIndex((entry) => entry[0] === 'ipc' && entry[1] === 'extension_host_activate')
  const invokeIndex = trace.findIndex((entry) => entry[0] === 'ipc' && entry[1] === 'extension_capability_invoke')
  const dockFocusIndex = trace.findIndex(
    (entry) =>
      entry[0] === 'workspace' &&
      entry[1] === 'setDocumentDockActivePage' &&
      entry[2] === 'extension:examplePdfExtension.tools',
  )
  assert.ok(dockFocusIndex >= 0, 'capability invocation must focus the plugin right-sidebar tab')
  assert.ok(activateIndex > dockFocusIndex, 'capability host activation must happen after sidebar focus')
  assert.ok(invokeIndex > activateIndex, 'capability invocation must happen after host activation')
  assert.deepEqual(trace.filter((entry) => entry[0] === 'workspace'), [
    ['workspace', 'openWorkspaceSurface'],
    ['workspace', 'setLeftSidebarPanel', 'files'],
    ['workspace', 'openDocumentDock'],
    ['workspace', 'setDocumentDockActivePage', 'extension:examplePdfExtension.tools'],
  ])

  console.log(JSON.stringify({
    ok: true,
    summary: {
      routedPanelId: workspace.documentDockActivePage,
      targetPreserved: task.target.path === target.path && task.target.referenceId === target.referenceId,
      sidebarFocusedBeforeActivation: dockFocusIndex < activateIndex,
      capabilityInvokedAfterActivation: activateIndex < invokeIndex,
      changedViewTick: extensions.viewRefreshTickFor('example-pdf-extension:examplePdfExtension.translateView'),
    },
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
}
