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

function buildReferenceLookup(references = []) {
  const byId = {}
  const byKey = {}
  for (const reference of references) {
    const id = normalizeString(reference?.id)
    const key = normalizeString(reference?.citationKey)
    if (id) {
      byId[id] = reference
      byKey[id] = reference
    }
    if (key) byKey[key] = reference
  }
  return { byId, byKey }
}

function buildReferenceSearchIndex(references = []) {
  return references.reduce((index, reference) => {
    const id = normalizeString(reference?.id)
    if (!id) return index
    index[id] = [
      reference.title,
      ...(Array.isArray(reference.authors) ? reference.authors : []),
      reference.authorLine,
      reference.source,
      reference.citationKey,
      reference.identifier,
      reference.pages,
      ...(Array.isArray(reference.tags) ? reference.tags : []),
    ].filter(Boolean).join(' ').toLowerCase()
    return index
  }, {})
}

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'references_query_resolve') {
      const params = args?.params && typeof args.params === 'object' ? args.params : {}
      const references = normalizeArray(params.references)
      const selectedReferenceId = normalizeString(params.preferredSelectedReferenceId)
      const selectedReference = references.find((reference) => reference?.id === selectedReferenceId) || null
      const documentReferenceSelections =
        params.documentReferenceSelections &&
        typeof params.documentReferenceSelections === 'object' &&
        !Array.isArray(params.documentReferenceSelections)
          ? params.documentReferenceSelections
          : {}
      const paperIds = Array.isArray(documentReferenceSelections['paper.tex'])
        ? documentReferenceSelections['paper.tex']
        : []
      const paperReferences = references.filter((reference) => paperIds.includes(reference.id))
      const availableReferences = references.filter((reference) => !paperIds.includes(reference.id))
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
        selectedReference,
        selectedCollection: null,
        selectedTag: null,
        referenceLookup: buildReferenceLookup(references),
        referenceSearchIndex: buildReferenceSearchIndex(references),
        documentReferenceState: {
          byPath: {
            'paper.tex': {
              referenceIds: paperIds,
              references: paperReferences,
              referenceLookup: buildReferenceLookup(paperReferences),
              referenceSearchIndex: buildReferenceSearchIndex(availableReferences),
              availableReferences,
            },
          },
          default: {
            referenceIds: [],
            references: [],
            referenceLookup: buildReferenceLookup([]),
            referenceSearchIndex: buildReferenceSearchIndex(references),
            availableReferences: references,
          },
        },
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
    references: [
      { id: 'ref-a', title: 'Alpha', citationKey: 'alpha2026' },
      { id: 'ref-b', title: 'Beta', citationKey: 'beta2026' },
    ],
    documentReferenceSelections: {
      'paper.tex': ['ref-a'],
    },
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
  assert.deepEqual(result.filteredReferences.map((reference) => reference.id), ['ref-a', 'ref-b'])
  assert.deepEqual(result.referenceLookup.byKey.alpha2026.id, 'ref-a')
  assert.equal(result.referenceSearchIndex['ref-a'].includes('alpha2026'), true)
  assert.deepEqual(result.documentReferenceState.byPath['paper.tex'].referenceIds, ['ref-a'])
  assert.equal(
    result.documentReferenceState.byPath['paper.tex'].referenceSearchIndex['ref-b'].includes('beta2026'),
    true,
  )
  assert.deepEqual(
    result.documentReferenceState.byPath['paper.tex'].availableReferences.map((reference) => reference.id),
    ['ref-b'],
  )

  const defaultResult = await resolveReferenceQuery(null)
  assert.equal(calls[1].args.params, null)
  assert.deepEqual(defaultResult.filteredReferences, [])

  console.log('reference query rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
