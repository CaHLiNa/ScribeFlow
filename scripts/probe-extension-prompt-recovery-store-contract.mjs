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

  let promptBlocking = true
  let failNextSelectionReplay = false
  const ipcCalls = []
  mockIPC((cmd, args) => {
    ipcCalls.push([cmd, args])
    if (cmd === 'extension_view_resolve') {
      if (promptBlocking) {
        throw new Error('Extension host is waiting for UI input from example-pdf-extension; complete or cancel that prompt before sending another top-level request')
      }
      return {
        viewId: 'examplePdfExtension.translateView',
        title: 'Translate PDF',
        description: 'Recovered after prompt',
        items: [
          {
            id: 'group',
            handle: 'group',
            label: 'Recovered item',
            collapsibleState: 'none',
            children: [],
          },
        ],
        resultEntries: [],
        artifacts: [],
        outputs: [],
      }
    }
    if (cmd === 'extension_host_notify_view_selection') {
      if (promptBlocking) {
        throw new Error('Extension host is waiting for UI input from example-pdf-extension; complete or cancel that prompt before sending another top-level request')
      }
      if (failNextSelectionReplay) {
        failNextSelectionReplay = false
        throw new Error('Selection replay transport failed')
      }
      return {
        extensionId: 'example-pdf-extension',
        viewId: 'examplePdfExtension.translateView',
        accepted: true,
      }
    }
    if (cmd === 'extension_host_respond_ui_request') {
      promptBlocking = false
      return {
        requestId: String(args?.params?.requestId || ''),
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
  const { useExtensionWindowUiStore } = await vite.ssrLoadModule('/src/stores/extensionWindowUi.js')

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
    contributedCommands: [],
    contributedMenus: [],
    contributedKeybindings: [],
    contributedViewContainers: [],
    contributedViews: [
      {
        id: 'examplePdfExtension.translateView',
        containerId: 'examplePdfExtension.tools',
        panelId: 'extension:examplePdfExtension.tools',
        title: 'Translate PDF',
      },
    ],
    contributedViewTitleMenus: [],
    contributedViewItemMenus: [],
    contributedCapabilities: [],
    capabilities: [],
    settingsSchema: {},
    warnings: [],
    errors: [],
  }]

  const extensionWindowUi = useExtensionWindowUiStore(pinia)
  extensionWindowUi.presentRequest({
    requestId: 'request-recovery',
    extensionId: 'example-pdf-extension',
    workspaceRoot: '/tmp/workspace',
    kind: 'inputBox',
    title: 'Recovery prompt',
    prompt: 'Resolve after close',
    placeholder: 'Type here',
    value: 'seed',
  })

  await assert.rejects(
    () => extensions.resolveView(
      { extensionId: 'example-pdf-extension', id: 'examplePdfExtension.translateView' },
      { kind: 'pdf', path: '/tmp/paper.pdf', referenceId: 'ref-123' },
      {},
      '',
    ),
    /waiting for UI input/i,
  )

  await assert.rejects(
    () => extensions.notifyViewSelection(
      { extensionId: 'example-pdf-extension', id: 'examplePdfExtension.translateView' },
      'group',
    ),
    /waiting for UI input/i,
  )

  assert.equal(Object.keys(extensions.deferredViewRequests).length, 2)

  await extensionWindowUi.resolve('typed-confirm-value')
  await extensions.flushDeferredViewRequests()

  assert.equal(Object.keys(extensions.deferredViewRequests).length, 0)
  const resolvedView = extensions.resolvedViewFor('example-pdf-extension:examplePdfExtension.translateView')
  assert.equal(resolvedView?.items?.[0]?.label, 'Recovered item')

  extensions.deferViewRequest({
    kind: 'notifyViewSelection',
    extensionId: 'example-pdf-extension',
    viewId: 'examplePdfExtension.translateView',
    itemHandle: 'group',
  })
  failNextSelectionReplay = true

  await assert.rejects(
    () => extensions.flushDeferredViewRequests(),
    /Selection replay transport failed/i,
  )

  assert.equal(Object.keys(extensions.deferredViewRequests).length, 1)

  await extensions.resolveView(
    { extensionId: 'example-pdf-extension', id: 'examplePdfExtension.translateView' },
    { kind: 'pdf', path: '/tmp/paper.pdf', referenceId: 'ref-123' },
    {},
    '',
  )

  assert.equal(Object.keys(extensions.deferredViewRequests).length, 0)

  const resolveCalls = ipcCalls.filter(([cmd]) => cmd === 'extension_view_resolve')
  const selectionCalls = ipcCalls.filter(([cmd]) => cmd === 'extension_host_notify_view_selection')
  assert.equal(resolveCalls.length, 3)
  assert.equal(selectionCalls.length, 4)

  console.log(JSON.stringify({
    ok: true,
    summary: {
      deferredCountBeforeFlush: 2,
      deferredCountAfterInitialFlush: 0,
      recoveredItemLabel: resolvedView?.items?.[0]?.label || '',
      deferredCountAfterReplayFailure: 1,
      deferredCountAfterAutoRetry: Object.keys(extensions.deferredViewRequests).length,
      resolveCallCount: resolveCalls.length,
      selectionCallCount: selectionCalls.length,
    },
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
}
