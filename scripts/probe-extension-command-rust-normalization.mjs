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

    if (cmd === 'extension_command_execute' || cmd === 'extension_capability_invoke') {
      return {
        task: { id: 'task-a', state: 'succeeded' },
        changedViews: [],
        resultEntries: [],
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    executeExtensionCommand,
    invokeExtensionCapability,
  } = await vite.ssrLoadModule('/src/services/extensions/extensionCommands.ts')

  await executeExtensionCommand({
    globalConfigDir: 42,
    workspaceRoot: ' /tmp/workspace ',
    extensionId: ' example-pdf-extension ',
    commandId: 123,
    itemId: null,
    itemHandle: ' handle-1 ',
    target: 'not an object',
    settings: false,
  })
  await executeExtensionCommand(0)
  await invokeExtensionCapability({
    globalConfigDir: ' /tmp/global ',
    workspaceRoot: 12,
    extensionId: null,
    capabilityId: ' pdf.translate ',
    itemId: ' item-1 ',
    itemHandle: 789,
    target: { path: ' /tmp/paper.pdf ' },
    settings: ['not', 'an', 'object'],
  })
  await invokeExtensionCapability(false)

  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'extension_command_execute',
      'extension_command_execute',
      'extension_capability_invoke',
      'extension_capability_invoke',
    ],
  )
  assert.deepEqual(calls[0].args, {
    params: {
      globalConfigDir: 42,
      workspaceRoot: ' /tmp/workspace ',
      extensionId: ' example-pdf-extension ',
      commandId: 123,
      itemId: null,
      itemHandle: ' handle-1 ',
      target: 'not an object',
      settings: false,
    },
  })
  assert.deepEqual(calls[1].args, {
    params: 0,
  })
  assert.deepEqual(calls[2].args, {
    params: {
      globalConfigDir: ' /tmp/global ',
      workspaceRoot: 12,
      extensionId: null,
      capabilityId: ' pdf.translate ',
      itemId: ' item-1 ',
      itemHandle: 789,
      target: { path: ' /tmp/paper.pdf ' },
      settings: ['not', 'an', 'object'],
    },
  })
  assert.deepEqual(calls[3].args, {
    params: false,
  })

  console.log('extension command rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
