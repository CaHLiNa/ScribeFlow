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
  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'references_query_resolve') {
      const params = args?.params || {}
      return {
        query: {
          selectedSectionKey: params.selectedSectionKey || 'all',
          selectedSourceKey: params.selectedSourceKey || '',
          selectedCollectionKey: params.selectedCollectionKey || '',
          selectedTagKey: params.selectedTagKey || '',
          sortKey: params.sortKey || 'year-desc',
          selectedReferenceId: params.preferredSelectedReferenceId || '',
        },
        sectionCounts: {},
        sourceCounts: {},
        collectionCounts: {},
        tagCounts: {},
        sortedReferences: params.references || [],
        filteredReferences: params.references || [],
        citationUsageIndex: {},
        citationUsageDetails: {},
      }
    }

    if (cmd === 'references_import_pdf') {
      return {
        id: 'imported-pdf',
        title: 'Adaptive Control',
        year: 2024,
        citationKey: 'ada2024',
      }
    }

    if (cmd === 'references_mutation_apply') {
      const action = args?.params?.action || {}
      if (action.type === 'importPdfReference') {
        assert.equal(action.reference.id, 'imported-pdf')
        return {
          snapshot: {
            ...args.params.snapshot,
            references: [
              {
                id: 'ref-1',
                title: 'Adaptive Control',
                year: 2024,
                citationKey: 'ada2024',
              },
            ],
          },
          result: {
            changed: false,
            duplicate: true,
            selectedReferenceId: 'ref-1',
            selectedReference: {
              id: 'ref-1',
              title: 'Adaptive Control',
              year: 2024,
              citationKey: 'ada2024',
            },
            preferredSelectedReferenceId: 'ref-1',
            attachedPdf: false,
          },
        }
      }

      if (action.type === 'updateReference') {
        assert.equal(action.referenceId, 'ref-1')
        assert.equal(action.updates.id, 'ref-1')
        assert.equal(action.updates.pdfPath, '/tmp/config/references/pdfs/ada2024.pdf')
        assert.deepEqual(args.params.snapshot.references, [
          {
            id: 'ref-1',
            title: 'Adaptive Control',
            year: 2024,
            citationKey: 'ada2024',
          },
        ])
        return {
          snapshot: {
            ...args.params.snapshot,
            references: [
              {
                id: 'ref-1',
                title: 'Adaptive Control',
                year: 2024,
                citationKey: 'ada2024',
                pdfPath: '/tmp/config/references/pdfs/ada2024.pdf',
                hasPdf: true,
              },
            ],
          },
          result: {
            changed: true,
            selectedReferenceId: 'ref-1',
            selectedReference: {
              id: 'ref-1',
              title: 'Adaptive Control',
              year: 2024,
              citationKey: 'ada2024',
              pdfPath: '/tmp/config/references/pdfs/ada2024.pdf',
              hasPdf: true,
            },
            preferredSelectedReferenceId: 'ref-1',
          },
        }
      }
    }

    if (cmd === 'references_snapshot_normalize') {
      const snapshot = args?.params?.snapshot || {}
      return {
        version: 2,
        citationStyle: snapshot.citationStyle || 'apa',
        documentReferenceSelections: snapshot.documentReferenceSelections || {},
        collections: Array.isArray(snapshot.collections) ? snapshot.collections : [],
        tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
        references: Array.isArray(snapshot.references) ? snapshot.references : [],
      }
    }

    if (cmd === 'references_snapshot_payload_build') {
      const state = args?.params?.state || {}
      return {
        version: 2,
        citationStyle: state.citationStyle || 'apa',
        documentReferenceSelections: state.documentReferenceSelections || {},
        collections: Array.isArray(state.collections) ? state.collections : [],
        tags: Array.isArray(state.tags) ? state.tags : [],
        references: Array.isArray(state.references) ? state.references : [],
      }
    }

    if (cmd === 'references_store_state_build') {
      const snapshot = args?.params?.snapshot || {}
      const state = args?.params?.state || {}
      const references = Array.isArray(snapshot.references) ? snapshot.references : []
      const preferredSelectedReferenceId = String(args?.params?.preferredSelectedReferenceId || '')
      return {
        snapshot,
        librarySections: [{ key: 'all' }],
        sourceSections: [{ key: 'zotero' }, { key: 'manual' }],
        collections: Array.isArray(snapshot.collections) ? snapshot.collections : [],
        tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
        references,
        documentReferenceSelections: snapshot.documentReferenceSelections || {},
        citationStyle: snapshot.citationStyle || 'apa',
        selectedSectionKey: state.selectedSectionKey || 'all',
        selectedSourceKey: state.selectedSourceKey || '',
        selectedCollectionKey: state.selectedCollectionKey || '',
        selectedTagKey: state.selectedTagKey || '',
        sortKey: state.sortKey || 'year-desc',
        selectedReferenceId: preferredSelectedReferenceId,
        resolvedQueryState: {
          query: {
            selectedSectionKey: state.selectedSectionKey || 'all',
            selectedSourceKey: state.selectedSourceKey || '',
            selectedCollectionKey: state.selectedCollectionKey || '',
            selectedTagKey: state.selectedTagKey || '',
            sortKey: state.sortKey || 'year-desc',
            selectedReferenceId: preferredSelectedReferenceId,
          },
          sectionCounts: {},
          sourceCounts: {},
          collectionCounts: {},
          tagCounts: {},
          sortedReferences: references,
          filteredReferences: references,
          selectedReferenceId: preferredSelectedReferenceId,
          citationUsageIndex: {},
          citationUsageDetails: {},
        },
      }
    }

    if (cmd === 'references_asset_store') {
      assert.deepEqual(args?.params?.reference, {})
      assert.equal(args?.params?.referenceId, 'ref-1')
      assert.deepEqual(args?.params?.references, [
        {
          id: 'ref-1',
          title: 'Adaptive Control',
          year: 2024,
          citationKey: 'ada2024',
        },
      ])
      return {
        id: 'ref-1',
        title: 'Adaptive Control',
        year: 2024,
        citationKey: 'ada2024',
        pdfPath: '/tmp/config/references/pdfs/ada2024.pdf',
        hasPdf: true,
      }
    }

    if (cmd === 'references_library_write') {
      return args?.params?.snapshot || {}
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { useReferencesStore } = await vite.ssrLoadModule('/src/stores/references.js')

  const pinia = createPinia()
  setActivePinia(pinia)
  const references = useReferencesStore(pinia)
  await references.applyLibrarySnapshot({
    version: 2,
    citationStyle: 'apa',
    collections: [],
    tags: [],
    references: [
      {
        id: 'ref-1',
        title: 'Adaptive Control',
        year: 2024,
        citationKey: 'ada2024',
      },
    ],
  })

  const imported = await references.importReferencePdf('/tmp/config', '/tmp/source.pdf')

  assert.equal(imported?.id, 'ref-1')
  assert.equal(imported?.pdfPath, '/tmp/config/references/pdfs/ada2024.pdf')
  assert.deepEqual(
    calls
      .filter((call) =>
        call.cmd === 'references_find_duplicate' ||
        call.cmd === 'references_merge_imported'
      )
      .map((call) => call.cmd),
    [],
  )
  assert.deepEqual(
    calls
      .filter((call) => call.cmd === 'references_mutation_apply')
      .map((call) => call.args?.params?.action?.type),
    ['importPdfReference', 'updateReference'],
  )

  console.log(JSON.stringify({
    ok: true,
    summary: {
      selectedReferenceId: imported.id,
      pdfPath: imported.pdfPath,
      mutationActions: calls
        .filter((call) => call.cmd === 'references_mutation_apply')
        .map((call) => call.args?.params?.action?.type),
      assetStoreReferenceId: calls.find((call) => call.cmd === 'references_asset_store')
        ?.args?.params?.referenceId,
    },
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
}
