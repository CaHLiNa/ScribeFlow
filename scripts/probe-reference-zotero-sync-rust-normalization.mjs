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
  let shouldSkip = false

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'references_zotero_sync_persist_with_account') {
      return !shouldSkip
        ? {
            snapshot: {
              version: 2,
              references: [{ id: 'ref-a' }],
            },
            selectedReferenceId: 'ref-a',
            lastSyncTime: '2026-05-12T00:00:00Z',
            imported: 1,
            linked: 0,
            updated: 2,
          }
        : {
            skipped: true,
            imported: 0,
            linked: 0,
            updated: 0,
          }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { syncNow } = await vite.ssrLoadModule('/src/services/references/zoteroSync.js')

  const snapshot = {
    version: 2,
    references: [{ id: 'ref-a' }],
  }
  const synced = await syncNow('/tmp/project-root', {
    snapshot,
    selectedReferenceId: 42,
  })

  assert.deepEqual(synced, {
    snapshot: {
      version: 2,
      references: [{ id: 'ref-a' }],
    },
    selectedReferenceId: 'ref-a',
    lastSyncTime: '2026-05-12T00:00:00Z',
    imported: 1,
    linked: 0,
    updated: 2,
  })

  shouldSkip = true
  const skipped = await syncNow('/tmp/project-root', {
    snapshot: 'not-an-object',
    selectedReferenceId: null,
  })

  assert.deepEqual(skipped, {
    skipped: true,
    imported: 0,
    linked: 0,
    updated: 0,
  })
  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'references_zotero_sync_persist_with_account',
      'references_zotero_sync_persist_with_account',
    ],
  )
  assert.deepEqual(calls[0].args.params, {
    globalConfigDir: '/tmp/project-root',
    snapshot,
    selectedReferenceId: 42,
  })
  assert.deepEqual(calls[1].args.params, {
    globalConfigDir: '/tmp/project-root',
    snapshot: 'not-an-object',
    selectedReferenceId: null,
  })

  console.log('reference zotero sync rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
