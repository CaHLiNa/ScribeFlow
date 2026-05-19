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
    if (cmd === 'extension_view_resolve') {
      return {
        viewId: 'examplePdfExtension.translateView',
        title: 'Translate PDF',
        description: `Resolved for ${String(args?.params?.workspaceRoot || '')}`,
        items: [],
        resultEntries: [],
        artifacts: [],
        outputs: [],
      }
    }
    if (cmd === 'extension_host_notify_view_selection') {
      return {
        extensionId: 'example-pdf-extension',
        viewId: 'examplePdfExtension.translateView',
        accepted: true,
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
  workspace.path = '/tmp/workspace-b'
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

  extensions.deferViewRequest({
    kind: 'resolveView',
    extensionId: 'example-pdf-extension',
    workspaceRoot: '/tmp/workspace-a',
    viewId: 'examplePdfExtension.translateView',
    target: { kind: 'pdf', path: '/tmp/workspace-a/paper.pdf', referenceId: 'ref-a' },
  })
  extensions.deferViewRequest({
    kind: 'notifyViewSelection',
    extensionId: 'example-pdf-extension',
    workspaceRoot: '/tmp/workspace-a',
    viewId: 'examplePdfExtension.translateView',
    itemHandle: 'group-a',
  })

  assert.equal(Object.keys(extensions.deferredViewRequests).length, 2)

  const replayed = await extensions.flushDeferredViewRequests()

  assert.deepEqual(replayed, [])
  assert.equal(Object.keys(extensions.deferredViewRequests).length, 0)
  assert.equal(ipcCalls.filter(([cmd]) => cmd === 'extension_view_resolve').length, 0)
  assert.equal(ipcCalls.filter(([cmd]) => cmd === 'extension_host_notify_view_selection').length, 0)

  await extensions.resolveView(
    { extensionId: 'example-pdf-extension', id: 'examplePdfExtension.translateView' },
    { kind: 'pdf', path: '/tmp/workspace-b/paper.pdf', referenceId: 'ref-b' },
    {},
    '',
  )

  const resolveCalls = ipcCalls.filter(([cmd]) => cmd === 'extension_view_resolve')
  assert.equal(resolveCalls.length, 1)
  assert.equal(
    String(resolveCalls[0]?.[1]?.params?.workspaceRoot || ''),
    '/tmp/workspace-b',
  )

  console.log(JSON.stringify({
    ok: true,
    summary: {
      staleDeferredCountBeforeFlush: 2,
      replayedCount: replayed.length,
      staleDeferredCountAfterFlush: Object.keys(extensions.deferredViewRequests).length,
      staleResolveCalls: ipcCalls.filter(([cmd]) => cmd === 'extension_view_resolve').length - 1,
      freshResolveWorkspaceRoot: String(resolveCalls[0]?.[1]?.params?.workspaceRoot || ''),
    },
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
}
