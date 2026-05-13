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

function defaultSnapshot() {
  return {
    version: 2,
    citationStyle: 'apa',
    documentReferenceSelections: {},
    collections: [],
    tags: [],
    references: [],
  }
}

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'references_snapshot_normalize') {
      return args?.params?.snapshot && typeof args.params.snapshot === 'object'
        ? args.params.snapshot
        : defaultSnapshot()
    }

    if (cmd === 'references_library_load_workspace') {
      return defaultSnapshot()
    }

    if (cmd === 'references_library_write') {
      return args?.params?.snapshot && typeof args.params.snapshot === 'object'
        ? args.params.snapshot
        : defaultSnapshot()
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    normalizeReferenceLibrarySnapshotWithBackend,
    readOrCreateReferenceLibrarySnapshot,
    writeReferenceLibrarySnapshot,
  } = await vite.ssrLoadModule('/src/services/references/referenceLibraryIO.js')

  await normalizeReferenceLibrarySnapshotWithBackend(false)
  await readOrCreateReferenceLibrarySnapshot(false)
  await writeReferenceLibrarySnapshot(42, 'not-a-snapshot')

  assert.deepEqual(calls.map((call) => call.cmd), [
    'references_snapshot_normalize',
    'references_library_load_workspace',
    'references_library_write',
  ])
  assert.deepEqual(calls[0].args.params, { snapshot: false })
  assert.deepEqual(calls[1].args.params, { globalConfigDir: false })
  assert.deepEqual(calls[2].args.params, {
    globalConfigDir: 42,
    snapshot: 'not-a-snapshot',
  })

  console.log('reference library rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
