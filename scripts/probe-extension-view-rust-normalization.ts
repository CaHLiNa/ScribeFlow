import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
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

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'extension_view_resolve') {
      return { viewId: 'exampleExtension.tools', items: [] }
    }

    if (cmd === 'extension_host_notify_view_selection') {
      return { extensionId: 'example-extension', viewId: 'exampleExtension.tools', accepted: true }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    notifyExtensionViewSelection,
    resolveExtensionView,
  } = await vite.ssrLoadModule('/src/services/extensions/extensionViews.ts')

  await resolveExtensionView({
    globalConfigDir: 42,
    workspaceRoot: ' /tmp/workspace ',
    extensionId: null,
    viewId: ' exampleExtension.tools ',
    parentItemId: 123,
    commandId: ' command.id ',
    targetKind: false,
    referenceId: ' ref-123 ',
    targetPath: ' /tmp/paper.pdf ',
    settings: ['not', 'an', 'object'],
  })
  await resolveExtensionView(false)
  await notifyExtensionViewSelection({
    globalConfigDir: ' /tmp/global ',
    workspaceRoot: 456,
    extensionId: ' example-extension ',
    viewId: null,
    itemHandle: 789,
  })
  await notifyExtensionViewSelection(0)

  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'extension_view_resolve',
      'extension_view_resolve',
      'extension_host_notify_view_selection',
      'extension_host_notify_view_selection',
    ],
  )
  assert.deepEqual(calls[0].args, {
    params: {
      globalConfigDir: 42,
      workspaceRoot: ' /tmp/workspace ',
      extensionId: null,
      viewId: ' exampleExtension.tools ',
      parentItemId: 123,
      commandId: ' command.id ',
      targetKind: false,
      referenceId: ' ref-123 ',
      targetPath: ' /tmp/paper.pdf ',
      settings: ['not', 'an', 'object'],
    },
  })
  assert.deepEqual(calls[1].args, {
    params: false,
  })
  assert.deepEqual(calls[2].args, {
    params: {
      globalConfigDir: ' /tmp/global ',
      workspaceRoot: 456,
      extensionId: ' example-extension ',
      viewId: null,
      itemHandle: 789,
    },
  })
  assert.deepEqual(calls[3].args, {
    params: 0,
  })

  console.log('extension view rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
