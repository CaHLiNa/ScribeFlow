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

    if (cmd === 'references_zotero_delete_item_with_account') {
      return null
    }

    if (cmd === 'references_zotero_remote_libraries_with_account') {
      return {
        groups: [
          {
            id: 'group-1',
            name: 'Research Group',
          },
        ],
        userCollections: [
          {
            key: 'user-collection',
            name: 'User Collection',
          },
        ],
        groupCollections: [
          {
            group: {
              id: 'group-1',
              name: 'Research Group',
            },
            collections: [
              {
                key: 'group-collection',
                name: 'Group Collection',
              },
            ],
          },
        ],
      }
    }

    if (cmd === 'get_global_config_dir') {
      return '/tmp/global-config'
    }

    if (cmd === 'references_zotero_account_state_load') {
      return {
        config: {
          userId: '16788433',
          username: 'researcher',
        },
        hasApiKey: true,
      }
    }

    if (cmd === 'references_zotero_api_key_load') {
      throw new Error('Settings account state must not load the raw Zotero API key into JS')
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { deleteFromZotero, loadRemoteLibraries, loadZoteroAccountState, syncNow } =
    await vite.ssrLoadModule('/src/services/references/zoteroSync.js')

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

  await deleteFromZotero({
    _zoteroKey: ' Q6ZQTSEA ',
    _zoteroLibrary: ' user/16788433 ',
  })

  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'references_zotero_sync_persist_with_account',
      'references_zotero_sync_persist_with_account',
      'references_zotero_delete_item_with_account',
    ],
  )
  assert.deepEqual(calls[2].args.params, {
    reference: {
      _zoteroKey: ' Q6ZQTSEA ',
      _zoteroLibrary: ' user/16788433 ',
    },
  })

  const libraries = await loadRemoteLibraries(42)

  assert.deepEqual(libraries, {
    groups: [
      {
        id: 'group-1',
        name: 'Research Group',
      },
    ],
    userCollections: [
      {
        key: 'user-collection',
        name: 'User Collection',
      },
    ],
    groupCollections: [
      {
        group: {
          id: 'group-1',
          name: 'Research Group',
        },
        collections: [
          {
            key: 'group-collection',
            name: 'Group Collection',
          },
        ],
      },
    ],
  })
  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'references_zotero_sync_persist_with_account',
      'references_zotero_sync_persist_with_account',
      'references_zotero_delete_item_with_account',
      'references_zotero_remote_libraries_with_account',
    ],
  )
  assert.deepEqual(calls[3].args.params, {
    userId: 42,
  })

  const accountState = await loadZoteroAccountState()

  assert.deepEqual(accountState, {
    config: {
      userId: '16788433',
      username: 'researcher',
    },
    hasApiKey: true,
  })
  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'references_zotero_sync_persist_with_account',
      'references_zotero_sync_persist_with_account',
      'references_zotero_delete_item_with_account',
      'references_zotero_remote_libraries_with_account',
      'get_global_config_dir',
      'references_zotero_account_state_load',
    ],
  )
  assert.deepEqual(calls[5].args.params, {
    globalConfigDir: '/tmp/global-config',
  })
  assert.equal(
    calls.some((call) => call.cmd === 'references_zotero_api_key_load'),
    false,
  )

  console.log('reference zotero sync rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
