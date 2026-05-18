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
  const normalizeResult = 'rust-owned-snapshot-normalize'
  const payloadResult = 'rust-owned-snapshot-payload-build'
  const loadResult = 'rust-owned-library-load'
  const writeResult = 'rust-owned-library-write'

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'references_snapshot_normalize') {
      return normalizeResult
    }

    if (cmd === 'references_snapshot_payload_build') {
      return payloadResult
    }

    if (cmd === 'references_library_load_workspace') {
      return loadResult
    }

    if (cmd === 'references_library_write') {
      return writeResult
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    buildReferenceLibrarySnapshotPayloadWithBackend,
    normalizeReferenceLibrarySnapshotWithBackend,
    readOrCreateReferenceLibrarySnapshot,
    writeReferenceLibrarySnapshot,
  } = await vite.ssrLoadModule('/src/services/references/referenceLibraryIO.js')

  const normalized = await normalizeReferenceLibrarySnapshotWithBackend(false)
  const payload = await buildReferenceLibrarySnapshotPayloadWithBackend({ citationStyle: 'ieee' })
  const loaded = await readOrCreateReferenceLibrarySnapshot(false)
  const written = await writeReferenceLibrarySnapshot(42, 'not-a-snapshot')

  assert.deepEqual(calls.map((call) => call.cmd), [
    'references_snapshot_normalize',
    'references_snapshot_payload_build',
    'references_library_load_workspace',
    'references_library_write',
  ])
  assert.deepEqual(calls[0].args.params, { snapshot: false })
  assert.deepEqual(calls[1].args.params, { state: { citationStyle: 'ieee' } })
  assert.deepEqual(calls[2].args.params, { globalConfigDir: false })
  assert.deepEqual(calls[3].args.params, {
    globalConfigDir: 42,
    snapshot: 'not-a-snapshot',
  })
  assert.strictEqual(normalized, normalizeResult)
  assert.strictEqual(payload, payloadResult)
  assert.strictEqual(loaded, loadResult)
  assert.strictEqual(written, writeResult)

  console.log('reference library rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
