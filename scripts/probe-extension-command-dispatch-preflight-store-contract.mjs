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

  const ipcCalls = []
  mockIPC((cmd, args) => {
    ipcCalls.push([cmd, args])
    if (cmd === 'extension_host_status') {
      return {
        available: true,
        runtime: 'node-extension-host-persistent',
        activatedExtensions: ['example-pdf-extension'],
        activeRuntimeSlots: [
          {
            extensionId: 'example-pdf-extension',
            workspaceRoot: '/tmp/workspace-a',
          },
          {
            extensionId: 'another-extension',
            workspaceRoot: '/tmp/workspace-b',
          },
        ],
        pendingPromptOwner: {
          extensionId: 'another-extension',
          workspaceRoot: '/tmp/workspace-b',
        },
      }
    }
    if (cmd === 'extension_registry_list') {
      return [
        {
          id: 'example-pdf-extension',
          name: 'Example PDF Extension',
          version: '0.1.0',
          scope: 'workspace',
          status: 'available',
          manifest_format: 'package.json',
          main: './dist/extension.js',
          activation_events: ['onCommand:scribeflow.pdf.translate'],
          capabilities: [],
          warnings: [],
          errors: [],
          manifest: {
            main: './dist/extension.js',
            activationEvents: ['onCommand:scribeflow.pdf.translate'],
            contributes: {
              commands: [
                {
                  command: 'scribeflow.pdf.translate',
                  title: 'Translate',
                  category: 'PDF',
                },
              ],
              viewsContainers: {},
              views: {},
            },
          },
        },
      ]
    }
    if (cmd === 'extension_settings_load') {
      return {
        enabledExtensionIds: ['example-pdf-extension'],
        extensionConfig: {},
        settingsExists: true,
      }
    }
    if (cmd === 'extension_task_list') return []
    throw new Error(`Unexpected IPC command: ${cmd}`)
  }, { shouldMockEvents: true })

  const { useExtensionsStore } = await vite.ssrLoadModule('/src/stores/extensions.ts')
  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.ts')
  const {
    isExtensionCommandBlockedError,
    describeExtensionCommandError,
  } = await vite.ssrLoadModule('/src/domains/extensions/extensionCommandHostState.ts')

  const pinia = createPinia()
  setActivePinia(pinia)

  const workspace = useWorkspaceStore(pinia)
  workspace.path = '/tmp/workspace-a'
  workspace.ensureGlobalConfigDir = async () => '/tmp/global-config'

  const extensions = useExtensionsStore(pinia)
  extensions.registry = [
    {
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
      contributedViewContainers: [],
      contributedViews: [],
      contributedViewTitleMenus: [],
      contributedViewItemMenus: [],
      contributedCapabilities: [],
      capabilities: [],
      settingsSchema: {},
      warnings: [],
      errors: [],
    },
  ]
  extensions.enabledExtensionIds = ['example-pdf-extension']

  let blockedError = null
  try {
    await extensions.executeCommand({
      extensionId: 'example-pdf-extension',
      commandId: 'scribeflow.pdf.translate',
      title: 'Translate',
    }, {
      kind: 'pdf',
      path: '/tmp/workspace-a/paper.pdf',
      referenceId: 'ref-123',
    })
  } catch (error) {
    blockedError = error
  }

  assert.ok(blockedError)
  assert.equal(isExtensionCommandBlockedError(blockedError), true)
  assert.equal(blockedError.hostState, 'blocked')
  const described = describeExtensionCommandError(blockedError, 'fallback')
  assert.equal(described.type, 'warning')
  assert.equal(described.messageParams.extensionId, 'another-extension')
  assert.equal(described.messageParams.workspace, '/tmp/workspace-b')
  assert.equal(
    ipcCalls.some(([cmd]) => cmd === 'extension_execute_command'),
    false,
  )
  assert.equal(
    ipcCalls.some(([cmd]) => cmd === 'extension_host_activate'),
    false,
  )

  console.log(JSON.stringify({
    ok: true,
    summary: {
      blocked: blockedError.hostState,
      blockedOwner: described.messageParams.extensionId,
      blockedWorkspace: described.messageParams.workspace,
      executeCommandSentToHost: ipcCalls.some(([cmd]) => cmd === 'extension_execute_command'),
      activateSentToHost: ipcCalls.some(([cmd]) => cmd === 'extension_host_activate'),
    },
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
}
