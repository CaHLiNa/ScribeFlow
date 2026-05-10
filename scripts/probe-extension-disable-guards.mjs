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
      return []
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
    path: '/tmp/paper.pdf',
    referenceId: 'ref-123',
  }

  const disabledSnapshot = await extensions.setExtensionEnabled('example-pdf-extension', false)
  assert.deepEqual(disabledSnapshot.enabledExtensionIds, [])
  assert.equal(extensions.isExtensionEnabled('example-pdf-extension'), false)
  assert.equal(extensions.runtimeRegistry['example-pdf-extension'], undefined)
  assert.equal(extensions.resolvedViews['example-pdf-extension:examplePdfExtension.translateView'], undefined)
  assert.equal(extensions.viewState['example-pdf-extension:examplePdfExtension.translateView'], undefined)
  assert.equal(extensions.viewControllerState['example-pdf-extension:examplePdfExtension.translateView'], undefined)
  assert.equal(extensions.changedViewTicks['example-pdf-extension:examplePdfExtension.translateView'], undefined)
  assert.equal(extensions.sidebarTargets['extension:examplePdfExtension.tools'], undefined)
  assert.ok(
    ipcCalls.some(([cmd, args]) =>
      cmd === 'extension_host_deactivate' &&
      String(args?.params?.extensionId || '') === 'example-pdf-extension'
    ),
  )

  await assert.rejects(
    () => extensions.executeCommand({
      extensionId: 'example-pdf-extension',
      commandId: 'scribeflow.pdf.translate',
    }, {
      kind: 'pdf',
      path: '/tmp/paper.pdf',
      referenceId: 'ref-123',
    }),
    /Extension command is disabled/i,
  )

  await assert.rejects(
    () => extensions.invokeCapability({
      extensionId: 'example-pdf-extension',
      capabilityId: 'pdf.translate',
    }, {
      kind: 'pdf',
      path: '/tmp/paper.pdf',
      referenceId: 'ref-123',
    }),
    /Extension capability is disabled/i,
  )

  await assert.rejects(
    () => extensions.resolveView({
      extensionId: 'example-pdf-extension',
      id: 'examplePdfExtension.translateView',
    }, {
      kind: 'pdf',
      path: '/tmp/paper.pdf',
      referenceId: 'ref-123',
    }),
    /Extension view is disabled/i,
  )

  await assert.rejects(
    () => extensions.notifyViewSelection({
      extensionId: 'example-pdf-extension',
      id: 'examplePdfExtension.translateView',
    }, 'translate-group'),
    /Extension view is disabled/i,
  )

  const forbiddenCalls = ipcCalls
    .map(([cmd]) => cmd)
    .filter((cmd) => [
      'extension_host_activate',
      'extension_command_execute',
      'extension_capability_invoke',
      'extension_view_resolve',
      'extension_host_notify_view_selection',
    ].includes(cmd))

  assert.deepEqual(forbiddenCalls, [])

  console.log(JSON.stringify({
    ok: true,
    disabledRuntimeCleared: true,
    deactivationObserved: ipcCalls.some(([cmd]) => cmd === 'extension_host_deactivate'),
    forbiddenCalls,
    persistedEnabledIds: disabledSnapshot.enabledExtensionIds,
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
}
