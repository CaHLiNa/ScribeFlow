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

    if (cmd === 'extension_host_activate') {
      return { extensionId: 'example-extension', activated: true }
    }
    if (cmd === 'extension_host_deactivate') {
      return { extensionId: 'example-extension', accepted: true }
    }
    if (cmd === 'extension_host_cancel_window_inputs') {
      return { extensionId: 'example-extension', accepted: true, cancelledRequestIds: [] }
    }
    if (cmd === 'extension_host_update_settings') {
      return { extensionId: 'example-extension', accepted: true, changedKeys: [] }
    }
    if (cmd === 'extension_host_resolve_host_call') {
      return { requestId: 'request-1', accepted: true }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    activateExtensionHost,
    cancelExtensionWindowInputs,
    deactivateExtensionHost,
    resolveExtensionHostCall,
    updateExtensionHostSettings,
  } = await vite.ssrLoadModule('/src/services/extensions/extensionHost.js')

  await activateExtensionHost({
    globalConfigDir: 42,
    workspaceRoot: ' /tmp/workspace ',
    extensionId: null,
    activationEvent: ' onCommand:example.run ',
  })
  await activateExtensionHost(false)
  await deactivateExtensionHost({
    extensionId: 123,
    workspaceRoot: ' /tmp/workspace ',
  })
  await cancelExtensionWindowInputs({
    extensionId: ' example-extension ',
    workspaceRoot: 456,
  })
  await updateExtensionHostSettings({
    globalConfigDir: ' /tmp/global ',
    workspaceRoot: ' /tmp/workspace ',
    extensionId: ' example-extension ',
    settings: false,
  })
  await resolveExtensionHostCall({
    requestId: 789,
    accepted: undefined,
    result: { ok: true },
    error: false,
  })
  await resolveExtensionHostCall({
    requestId: ' request-2 ',
    accepted: false,
    result: null,
    error: ' denied ',
  })

  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'extension_host_activate',
      'extension_host_activate',
      'extension_host_deactivate',
      'extension_host_cancel_window_inputs',
      'extension_host_update_settings',
      'extension_host_resolve_host_call',
      'extension_host_resolve_host_call',
    ],
  )
  assert.deepEqual(calls[0].args, {
    params: {
      globalConfigDir: 42,
      workspaceRoot: ' /tmp/workspace ',
      extensionId: null,
      activationEvent: ' onCommand:example.run ',
    },
  })
  assert.deepEqual(calls[1].args, {
    params: false,
  })
  assert.deepEqual(calls[2].args, {
    params: {
      extensionId: 123,
      workspaceRoot: ' /tmp/workspace ',
    },
  })
  assert.deepEqual(calls[3].args, {
    params: {
      extensionId: ' example-extension ',
      workspaceRoot: 456,
    },
  })
  assert.deepEqual(calls[4].args, {
    params: {
      globalConfigDir: ' /tmp/global ',
      workspaceRoot: ' /tmp/workspace ',
      extensionId: ' example-extension ',
      settings: false,
    },
  })
  assert.deepEqual(calls[5].args, {
    params: {
      requestId: 789,
      accepted: undefined,
      result: { ok: true },
      error: false,
    },
  })
  assert.deepEqual(calls[6].args, {
    params: {
      requestId: ' request-2 ',
      accepted: false,
      result: null,
      error: ' denied ',
    },
  })

  console.log('extension host rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
