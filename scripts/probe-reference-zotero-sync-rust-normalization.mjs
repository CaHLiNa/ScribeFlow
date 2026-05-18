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

  const calls = []
  let shouldSkip = false
  const accountStateResult = 'rust-owned-zotero-account-state'
  const connectedConfigResult = 'rust-owned-zotero-connected-config'
  const loadedConfigResult = 'rust-owned-zotero-config-load'

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'references_zotero_sync_persist_with_account') {
      return !shouldSkip
        ? {
            snapshot: {
              version: 2,
              references: [{ id: 'ref-a' }],
            },
            skipped: false,
            selectedReferenceId: 'ref-a',
            lastSyncTime: '2026-05-12T00:00:00Z',
            zoteroSyncStatus: 'synced',
            zoteroSyncLastSyncTime: '2026-05-12T00:00:00Z',
            counts: {
              imported: 1,
              linked: 0,
              updated: 2,
            },
            imported: 1,
            linked: 0,
            updated: 2,
          }
        : {
            skipped: true,
            snapshot: {},
            selectedReferenceId: '',
            lastSyncTime: '',
            zoteroSyncStatus: 'disconnected',
            zoteroSyncLastSyncTime: '',
            counts: {
              imported: 0,
              linked: 0,
              updated: 0,
            },
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
      return accountStateResult
    }

    if (cmd === 'references_zotero_connect_account') {
      return connectedConfigResult
    }

    if (cmd === 'references_mutation_apply') {
      const action = args?.params?.action || {}
      if (action.type === 'addReference') {
        return {
          snapshot: {
            version: 2,
            references: [
              {
                ...action.reference,
                _appPushPending: action.markForZoteroPush === true,
              },
            ],
          },
          result: {
            changed: true,
            duplicate: false,
            selectedReferenceId: action.reference?.id || '',
            selectedReference: {
              ...action.reference,
              _appPushPending: action.markForZoteroPush === true,
            },
            preferredSelectedReferenceId: action.reference?.id || '',
          },
        }
      }

      if (action.type === 'mergeImportedReferences') {
        const imported = Array.isArray(action.imported) ? action.imported : []
        return {
          snapshot: {
            version: 2,
            references: imported,
          },
          result: {
            importedCount: imported.length,
            selectedReferenceId: imported[0]?.id || '',
            selectedReference: imported[0] || null,
            preferredSelectedReferenceId: imported[0]?.id || '',
            reusedExisting: false,
          },
        }
      }
    }

    if (cmd === 'references_snapshot_normalize') {
      return args?.params?.snapshot || {
        version: 2,
        references: [],
      }
    }

    if (cmd === 'references_library_write') {
      return args?.params?.snapshot || {
        version: 2,
        references: [],
      }
    }

    if (cmd === 'references_query_resolve') {
      const params = args?.params || {}
      const references = Array.isArray(params.references) ? params.references : []
      return {
        query: {},
        sectionCounts: {},
        sourceCounts: {},
        collectionCounts: {},
        tagCounts: {},
        sortedReferences: references,
        filteredReferences: references,
        citationUsageIndex: {},
        citationUsageDetails: {},
      }
    }

    if (cmd === 'references_zotero_config_save') {
      return args?.params?.config || {}
    }

    if (cmd === 'references_zotero_config_load') {
      return loadedConfigResult
    }

    if (cmd === 'references_zotero_api_key_load') {
      throw new Error('Settings account state must not load the raw Zotero API key into JS')
    }

    if (
      cmd === 'references_zotero_validate_api_key' ||
      cmd === 'references_zotero_api_key_store'
    ) {
      throw new Error('Zotero account and mutation decisions must run in Rust workflows')
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    connectZoteroAccount,
    deleteFromZotero,
    loadRemoteLibraries,
    loadZoteroAccountState,
    loadZoteroConfig,
    saveZoteroConfig,
    syncNow,
  } = await vite.ssrLoadModule('/src/services/references/zoteroSync.js')
  const { useReferencesStore } = await vite.ssrLoadModule('/src/stores/references.js')

  const pinia = createPinia()
  setActivePinia(pinia)

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
    skipped: false,
    selectedReferenceId: 'ref-a',
    lastSyncTime: '2026-05-12T00:00:00Z',
    zoteroSyncStatus: 'synced',
    zoteroSyncLastSyncTime: '2026-05-12T00:00:00Z',
    counts: {
      imported: 1,
      linked: 0,
      updated: 2,
    },
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
    snapshot: {},
    selectedReferenceId: '',
    lastSyncTime: '',
    zoteroSyncStatus: 'disconnected',
    zoteroSyncLastSyncTime: '',
    counts: {
      imported: 0,
      linked: 0,
      updated: 0,
    },
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

  const libraries = await loadRemoteLibraries({
    userId: ' 42 ',
    username: 'researcher',
  })

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
      'get_global_config_dir',
      'references_zotero_remote_libraries_with_account',
    ],
  )
  assert.deepEqual(calls[4].args.params, {
    globalConfigDir: '/tmp/global-config',
    config: {
      userId: ' 42 ',
      username: 'researcher',
    },
  })

  const referencesStore = useReferencesStore(pinia)
  const librariesFromStore = await referencesStore.loadZoteroRemoteLibraries({
    userId: '16788433',
    username: 'researcher',
  })
  assert.deepEqual(librariesFromStore, {
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
      'get_global_config_dir',
      'references_zotero_remote_libraries_with_account',
      'get_global_config_dir',
      'references_zotero_remote_libraries_with_account',
    ],
  )
  assert.deepEqual(calls[6].args.params, {
    globalConfigDir: '/tmp/global-config',
    config: {
      userId: '16788433',
      username: 'researcher',
    },
  })

  const accountState = await loadZoteroAccountState()

  assert.strictEqual(accountState, accountStateResult)
  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'references_zotero_sync_persist_with_account',
      'references_zotero_sync_persist_with_account',
      'references_zotero_delete_item_with_account',
      'get_global_config_dir',
      'references_zotero_remote_libraries_with_account',
      'get_global_config_dir',
      'references_zotero_remote_libraries_with_account',
      'get_global_config_dir',
      'references_zotero_account_state_load',
    ],
  )
  assert.deepEqual(calls[8].args.params, {
    globalConfigDir: '/tmp/global-config',
  })
  assert.equal(
    calls.some((call) => call.cmd === 'references_zotero_api_key_load'),
    false,
  )

  const connectedConfig = await connectZoteroAccount(' zotero-secret ')

  assert.strictEqual(connectedConfig, connectedConfigResult)
  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'references_zotero_sync_persist_with_account',
      'references_zotero_sync_persist_with_account',
      'references_zotero_delete_item_with_account',
      'get_global_config_dir',
      'references_zotero_remote_libraries_with_account',
      'get_global_config_dir',
      'references_zotero_remote_libraries_with_account',
      'get_global_config_dir',
      'references_zotero_account_state_load',
      'get_global_config_dir',
      'references_zotero_connect_account',
    ],
  )
  assert.deepEqual(calls[10].args.params, {
    globalConfigDir: '/tmp/global-config',
    apiKey: ' zotero-secret ',
  })
  assert.equal(
    calls.some((call) => (
      call.cmd === 'references_zotero_config_load' ||
      call.cmd === 'references_zotero_validate_api_key' ||
      call.cmd === 'references_zotero_api_key_store'
    )),
    false,
  )

  await saveZoteroConfig({
    userId: '16788433',
    autoSync: false,
    pushTarget: {
      libraryType: 'group',
      libraryId: '42',
      collectionKey: 'papers',
    },
  })
  assert.equal(calls.at(-2).cmd, 'get_global_config_dir')
  assert.equal(calls.at(-1).cmd, 'references_zotero_config_save')
  assert.deepEqual(calls.at(-1).args.params, {
    globalConfigDir: '/tmp/global-config',
    config: {
      userId: '16788433',
      autoSync: false,
      pushTarget: {
        libraryType: 'group',
        libraryId: '42',
        collectionKey: 'papers',
      },
    },
  })

  const addResult = await referencesStore.addReference('', {
    id: 'manual-ref',
    title: 'Manual Reference',
  }, { persist: false })
  assert.equal(addResult?.id, 'manual-ref')

  const importResult = await referencesStore.importParsedReferences('', [
    {
      id: 'imported-ref',
      title: 'Imported Reference',
    },
  ])
  assert.equal(importResult.importedCount, 1)
  assert.deepEqual(
    calls
      .filter((call) => call.cmd === 'references_mutation_apply')
      .map((call) => call.args.params),
    [
      {
        snapshot: {
          version: 2,
          citationStyle: 'apa',
          documentReferenceSelections: {},
          collections: [],
          tags: [],
          references: [],
        },
        selectedReferenceId: '',
        action: {
          type: 'addReference',
          reference: {
            id: 'manual-ref',
            title: 'Manual Reference',
          },
          markForZoteroPush: true,
        },
      },
      {
        snapshot: {
          version: 2,
          citationStyle: 'apa',
          documentReferenceSelections: {},
          collections: [],
          tags: [],
          references: [
            {
              id: 'manual-ref',
              title: 'Manual Reference',
              _appPushPending: true,
            },
          ],
        },
        selectedReferenceId: 'manual-ref',
        action: {
          type: 'mergeImportedReferences',
          imported: [
            {
              id: 'imported-ref',
              title: 'Imported Reference',
            },
          ],
          markForZoteroPush: true,
        },
      },
    ],
  )
  assert.equal(
    calls.some((call) => call.cmd === 'references_zotero_config_load'),
    false,
  )

  const loadedConfig = await loadZoteroConfig('/tmp/global-config')
  assert.strictEqual(loadedConfig, loadedConfigResult)
  assert.equal(calls.at(-1).cmd, 'references_zotero_config_load')
  assert.deepEqual(calls.at(-1).args.params, {
    globalConfigDir: '/tmp/global-config',
  })

  console.log('reference zotero sync rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
