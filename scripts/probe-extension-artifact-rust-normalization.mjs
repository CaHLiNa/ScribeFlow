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

    if (cmd === 'extension_artifact_open' || cmd === 'extension_artifact_reveal') {
      return null
    }

    if (cmd === 'extension_artifact_read_text') {
      return 'artifact text'
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    openExtensionArtifact,
    revealExtensionArtifact,
    readExtensionArtifactText,
  } = await vite.ssrLoadModule('/src/services/extensions/extensionArtifacts.js')

  await openExtensionArtifact({ path: ' /tmp/scribeflow-artifact.txt ' })
  await revealExtensionArtifact({ path: 42 })
  await readExtensionArtifactText({ path: ' /tmp/scribeflow-default-limit.txt ' })
  const text = await readExtensionArtifactText({ path: ' /tmp/scribeflow-artifact.txt ' }, '128')

  assert.equal(text, 'artifact text')
  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'extension_artifact_open',
      'extension_artifact_reveal',
      'extension_artifact_read_text',
      'extension_artifact_read_text',
    ],
  )
  assert.deepEqual(calls[0].args, {
    params: {
      path: ' /tmp/scribeflow-artifact.txt ',
    },
  })
  assert.deepEqual(calls[1].args, {
    params: {
      path: 42,
    },
  })
  assert.deepEqual(calls[2].args, {
    params: {
      path: ' /tmp/scribeflow-default-limit.txt ',
    },
  })
  assert.deepEqual(calls[3].args, {
    params: {
      path: ' /tmp/scribeflow-artifact.txt ',
      maxBytes: '128',
    },
  })

  console.log('extension artifact rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
