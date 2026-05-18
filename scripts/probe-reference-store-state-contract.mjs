import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildDefaultResolvedQueryState,
  hasReferenceById,
  isReferenceSelectedForDocument,
  normalizeCollectionMembershipValue,
  normalizeTagKey,
  resolveAvailableDocumentReferences,
  resolveCollection,
  resolveDocumentReferenceByKey,
  resolveDocumentReferenceIds,
  resolveDocumentReferences,
  resolveDocumentReferenceSelections,
  resolveReferenceByKey,
  resolveReferenceById,
  resolveReferencesForExport,
  resolveTag,
  searchReferences,
} from '../src/domains/references/referenceStoreState.js'

assert.equal(normalizeCollectionMembershipValue('  Methods  '), 'methods')
assert.equal(normalizeCollectionMembershipValue(null), '')
assert.equal(normalizeTagKey('  Theory  '), 'theory')
assert.equal(normalizeTagKey(undefined), '')

const collections = [
  { key: 'methods', label: 'Methods' },
  { key: 'ml', label: 'Machine Learning' },
]
assert.deepEqual(resolveCollection(collections, ' METHODS '), collections[0])
assert.deepEqual(resolveCollection(collections, ' machine learning '), collections[1])
assert.equal(resolveCollection(collections, 'missing'), null)
assert.equal(resolveCollection('not-array', 'methods'), null)

const tags = [
  { key: 'theory', label: 'Theory' },
  { key: 'pdf', label: 'PDF' },
]
assert.deepEqual(resolveTag(tags, ' THEORY '), tags[0])
assert.equal(resolveTag(tags, 'missing'), null)
assert.equal(resolveTag('not-array', 'theory'), null)

const selections = {
  'paper.tex': ['ref-1', 'ref-2'],
}
assert.equal(resolveDocumentReferenceSelections(selections), selections)
assert.deepEqual(resolveDocumentReferenceSelections(null), {})
assert.deepEqual(resolveDocumentReferenceSelections(['ref-1']), {})

const references = [
  {
    id: 'ref-1',
    title: 'Graph Neural Networks',
    authors: ['Ada Lovelace'],
    citationKey: 'lovelace2024',
    tags: ['graph'],
  },
  {
    id: 'ref-2',
    title: 'Bayesian Methods',
    authorLine: 'Grace Hopper',
    citationKey: 'hopper2025',
    source: 'Journal of Tests',
  },
  {
    id: 'ref-3',
    title: 'Unused Reference',
    citationKey: 'unused2026',
  },
]
const documentReferenceSelections = {
  'paper.tex': ['ref-1', 'ref-2'],
}
assert.deepEqual(resolveDocumentReferenceIds(documentReferenceSelections, ' paper.tex '), ['ref-1', 'ref-2'])
assert.deepEqual(resolveDocumentReferenceIds(documentReferenceSelections, ''), [])
assert.deepEqual(resolveDocumentReferences(documentReferenceSelections, references, 'paper.tex'), [
  references[0],
  references[1],
])
assert.deepEqual(resolveDocumentReferences(documentReferenceSelections, references, 'missing.tex'), [])
assert.deepEqual(resolveReferenceByKey(references, 'lovelace2024'), references[0])
assert.deepEqual(resolveReferenceByKey(references, 'ref-2'), references[1])
assert.equal(resolveReferenceByKey(references, 'missing'), null)
assert.deepEqual(resolveReferenceById(references, 'ref-2'), references[1])
assert.deepEqual(resolveReferenceById(references, ' ref-2 '), references[1])
assert.equal(resolveReferenceById(references, 'hopper2025'), null)
assert.equal(hasReferenceById(references, ' ref-2 '), true)
assert.equal(hasReferenceById(references, 'hopper2025'), false)
assert.equal(hasReferenceById('not-array', 'ref-2'), false)
assert.deepEqual(resolveReferencesForExport(references, []), references)
assert.deepEqual(resolveReferencesForExport(references, ['ref-3', 'missing', 'ref-1']), [
  references[2],
  references[0],
])
assert.deepEqual(resolveReferencesForExport('not-array', ['ref-1']), [])
assert.deepEqual(resolveDocumentReferenceByKey(documentReferenceSelections, references, 'paper.tex', 'hopper2025'), references[1])
assert.equal(resolveDocumentReferenceByKey(documentReferenceSelections, references, 'paper.tex', 'unused2026'), null)
assert.equal(isReferenceSelectedForDocument(documentReferenceSelections, references, 'paper.tex', 'ref-1'), true)
assert.equal(isReferenceSelectedForDocument(documentReferenceSelections, references, 'paper.tex', 'unused2026'), false)
assert.deepEqual(searchReferences(references, 'grace'), [references[1]])
assert.deepEqual(searchReferences(references, 'graph'), [references[0]])
assert.deepEqual(searchReferences(references, ''), references)
assert.deepEqual(resolveAvailableDocumentReferences(documentReferenceSelections, references, 'paper.tex', ''), [
  references[2],
])
assert.deepEqual(resolveAvailableDocumentReferences(documentReferenceSelections, references, 'paper.tex', 'unused'), [
  references[2],
])
assert.deepEqual(buildDefaultResolvedQueryState({
  references,
  selectedSectionKey: 'recent',
  selectedSourceKey: 'zotero',
  selectedCollectionKey: 'methods',
  selectedTagKey: 'theory',
  sortKey: 'title-asc',
  selectedReferenceId: 'ref-2',
}), {
  query: {
    selectedSectionKey: 'recent',
    selectedSourceKey: 'zotero',
    selectedCollectionKey: 'methods',
    selectedTagKey: 'theory',
    sortKey: 'title-asc',
    selectedReferenceId: 'ref-2',
  },
  sectionCounts: {},
  sourceCounts: {},
  collectionCounts: {},
  tagCounts: {},
  sortedReferences: references,
  filteredReferences: references,
  citationUsageIndex: {},
  citationUsageDetails: {},
})
assert.deepEqual(buildDefaultResolvedQueryState({ references: 'not-array' }), {
  query: {
    selectedSectionKey: 'all',
    selectedSourceKey: '',
    selectedCollectionKey: '',
    selectedTagKey: '',
    sortKey: 'year-desc',
    selectedReferenceId: '',
  },
  sectionCounts: {},
  sourceCounts: {},
  collectionCounts: {},
  tagCounts: {},
  sortedReferences: [],
  filteredReferences: [],
  citationUsageIndex: {},
  citationUsageDetails: {},
})

const storeSource = await readFile('src/stores/references.js', 'utf8')

assert.match(
  storeSource,
  /from '..\/domains\/references\/referenceStoreState\.js'/,
  'references store must import deterministic state rules from the reference domain',
)
assert.match(
  storeSource,
  /buildDefaultResolvedQueryState/,
  'references store must use the domain helper for default resolved query state',
)
assert.match(
  storeSource,
  /resolveDocumentReferenceSelections/,
  'references store must delegate document-reference selection shape fallback',
)
assert.match(
  storeSource,
  /resolveDocumentReferenceIds/,
  'references store must delegate document-reference id resolution',
)
assert.match(
  storeSource,
  /resolveDocumentReferences/,
  'references store must delegate selected document-reference resolution',
)
assert.match(
  storeSource,
  /resolveDocumentReferenceByKey/,
  'references store must delegate document-reference key lookup',
)
assert.match(
  storeSource,
  /isReferenceSelectedForDocument/,
  'references store must delegate document-reference selection checks',
)
assert.match(
  storeSource,
  /resolveAvailableDocumentReferences/,
  'references store must delegate available-reference search filtering',
)
assert.match(
  storeSource,
  /searchReferences/,
  'references store must delegate reference search rules',
)
assert.match(
  storeSource,
  /resolveCollection/,
  'references store must delegate collection matching',
)
assert.match(
  storeSource,
  /resolveTag/,
  'references store must delegate tag matching',
)
assert.match(
  storeSource,
  /resolveReferencesForExport/,
  'references store must delegate export reference-list resolution',
)
assert.match(
  storeSource,
  /resolveReferenceById/,
  'references store must delegate exact-id reference lookup for JSON export',
)
assert.match(
  storeSource,
  /hasReferenceById/,
  'references store must delegate exact-id presence checks',
)
assert.doesNotMatch(
  storeSource,
  /function normalizeCollectionMembershipValue|function normalizeTagKey|function resolveCollection|function resolveDocumentReferenceSelections|function buildDefaultResolvedQueryState|const selectedIds = new Set\(this\.getDocumentReferenceIds|const normalizedQuery = String\(query \|\| ''\)\.trim\(\)\.toLowerCase\(\)|haystack\.includes\(normalizedQuery\)|referenceIds\s*\.map\(\(referenceId\) => this\.references\.find|this\.references\.some\(\(reference\) => reference\.id/,
  'references store must not redefine deterministic state helpers inline',
)
assert.match(
  storeSource,
  /async function resolveReferenceStorageRoot/,
  'workspace-aware storage-root resolution must stay in the store/service boundary, not the pure domain helper',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    collectionAndTagMatchingDerived: true,
    documentSelectionFallbackDerived: true,
    documentReferenceLookupDerived: true,
    referenceSearchDerived: true,
    exportSelectionDerived: true,
    defaultQueryStateDerived: true,
    storeUsesDomainHelper: true,
    exactIdPresenceDerived: true,
    storageRootRemainsStoreScoped: true,
  },
}, null, 2))
