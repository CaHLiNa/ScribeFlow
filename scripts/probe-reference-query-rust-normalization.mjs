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

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeString(value) {
  return typeof value === 'string' ? value : ''
}

function normalizeFileContents(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'references_query_resolve') {
      const params = args?.params || {}
      const references = normalizeArray(params.references)
      const selectedReferenceId = normalizeString(params.preferredSelectedReferenceId)
      return {
        query: {
          selectedSectionKey: normalizeString(params.selectedSectionKey) || 'all',
          selectedSourceKey: normalizeString(params.selectedSourceKey),
          selectedCollectionKey: normalizeString(params.selectedCollectionKey),
          selectedTagKey: normalizeString(params.selectedTagKey),
          sortKey: normalizeString(params.sortKey) || 'year-desc',
          selectedReferenceId,
        },
        sectionCounts: {},
        sourceCounts: {},
        collectionCounts: {},
        tagCounts: {},
        sortedReferences: references,
        filteredReferences: references,
        selectedReferenceId,
        citationUsageIndex: {},
        citationUsageDetails: normalizeFileContents(params.fileContents),
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { resolveReferenceQuery } = await vite.ssrLoadModule(
    '/src/services/references/referenceRuntime.js',
  )

  const rawParams = {
    librarySections: 'not-an-array',
    sourceSections: [{ key: 'manual' }],
    collections: null,
    tags: [{ key: 'ai' }],
    references: [{ id: 'ref-a', title: 'Alpha' }],
    selectedSectionKey: 12,
    selectedSourceKey: 'manual',
    selectedCollectionKey: false,
    selectedTagKey: 'ai',
    sortKey: 'title-asc',
    preferredSelectedReferenceId: ['ref-a'],
    fileContents: 'not-an-object',
  }

  const result = await resolveReferenceQuery(rawParams)

  assert.deepEqual(calls.map((call) => call.cmd), ['references_query_resolve'])
  assert.deepEqual(calls[0].args.params, rawParams)
  assert.deepEqual(result.filteredReferences.map((reference) => reference.id), ['ref-a'])

  const defaultResult = await resolveReferenceQuery(null)
  assert.deepEqual(calls[1].args.params, {})
  assert.deepEqual(defaultResult.filteredReferences, [])

  console.log('reference query rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
