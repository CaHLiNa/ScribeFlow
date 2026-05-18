import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildDefaultResolvedQueryState,
  resolveReferenceCitationStyleId,
  resolveReferenceWorkspaceCitationStyles,
  buildReferenceLibrarySnapshotPayload,
  buildReferenceDockPdfCloseState,
  buildReferenceDockPdfOpenState,
  buildReferenceDockPdfResetState,
  buildReferenceDockPdfSnapshotState,
  buildReferenceCollectionSelectionState,
  buildReferenceQuerySelectionState,
  buildReferenceSectionSelectionState,
  buildReferenceSnapshotApplyState,
  buildReferenceSnapshotSelectionState,
  buildReferenceSortSelectionState,
  buildReferenceSourceSelectionState,
  buildReferenceStoreCleanupState,
  buildReferenceStoreInitialState,
  buildReferenceTagSelectionState,
  hasReferenceById,
  isReferenceDockPdfSelected,
  isReferenceSelectedForDocument,
  normalizeCollectionMembershipValue,
  normalizeReferenceSortKey,
  normalizeTagKey,
  resolveAvailableDocumentReferences,
  resolveCollection,
  resolveDocumentReferenceByKey,
  resolveDocumentReferenceIds,
  resolveDocumentReferences,
  resolveDocumentReferenceSelections,
  resolveReferenceByKey,
  resolveReferenceById,
  resolveReferenceCitationUsageKeys,
  resolveReferenceResolvedQueryState,
  resolveReferenceSelectionId,
  resolveReferenceSectionKey,
  resolveSelectedReference,
  resolveTag,
  searchReferences,
} from '../src/domains/references/referenceStoreState.js'

assert.equal(normalizeCollectionMembershipValue('  Methods  '), 'methods')
assert.equal(normalizeCollectionMembershipValue(null), '')
assert.equal(normalizeTagKey('  Theory  '), 'theory')
assert.equal(normalizeTagKey(undefined), '')
assert.equal(normalizeReferenceSortKey(' title-asc '), 'title-asc')
assert.equal(normalizeReferenceSortKey('invalid'), 'year-desc')

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

const sections = [
  { key: 'all', label: 'All' },
  { key: 'recent', label: 'Recent' },
]
assert.equal(resolveReferenceSectionKey(sections, ' recent ', 'all'), 'recent')
assert.equal(resolveReferenceSectionKey(sections, 'missing', 'all'), 'all')
assert.equal(resolveReferenceSectionKey('not-array', 'recent', 'all'), 'all')

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
assert.deepEqual(resolveSelectedReference(references, ' ref-2 ', [references[0]]), references[1])
assert.deepEqual(resolveSelectedReference(references, 'missing', [references[0]]), references[0])
assert.equal(resolveSelectedReference(references, 'missing', []), null)
assert.deepEqual([...resolveReferenceCitationUsageKeys({
  lovelace2024: ['paper.tex'],
  hopper2025: [],
})], ['lovelace2024', 'hopper2025'])
assert.deepEqual([...resolveReferenceCitationUsageKeys(null)], [])
assert.deepEqual([...resolveReferenceCitationUsageKeys(['lovelace2024'])], [])
assert.equal(resolveReferenceCitationStyleId(' ieee ', true), 'ieee')
assert.equal(resolveReferenceCitationStyleId(' ieee ', false), 'apa')
assert.equal(resolveReferenceCitationStyleId('  ', true), 'apa')
assert.deepEqual(resolveReferenceWorkspaceCitationStyles([{ id: 'ieee' }]), [{ id: 'ieee' }])
assert.deepEqual(resolveReferenceWorkspaceCitationStyles('not-array'), [])
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
assert.deepEqual(buildReferenceDockPdfOpenState(' ref-2 '), {
  canOpen: true,
  referenceDockPdfOpen: true,
  referenceDockPdfReferenceId: 'ref-2',
})
assert.deepEqual(buildReferenceDockPdfOpenState('  '), {
  canOpen: false,
  referenceDockPdfOpen: false,
  referenceDockPdfReferenceId: '',
})
assert.deepEqual(buildReferenceDockPdfCloseState({
  referenceDockPdfOpen: true,
  referenceDockPdfReferenceId: 'ref-2',
}, 'other-ref'), {
  changed: false,
  referenceDockPdfOpen: true,
  referenceDockPdfReferenceId: 'ref-2',
})
assert.deepEqual(buildReferenceDockPdfCloseState({
  referenceDockPdfOpen: true,
  referenceDockPdfReferenceId: 'ref-2',
}, ' ref-2 '), {
  changed: true,
  referenceDockPdfOpen: false,
  referenceDockPdfReferenceId: '',
})
assert.deepEqual(buildReferenceDockPdfResetState(), {
  referenceDockPdfOpen: false,
  referenceDockPdfReferenceId: '',
})
assert.equal(isReferenceDockPdfSelected({
  referenceDockPdfOpen: true,
  referenceDockPdfReferenceId: 'ref-2',
  selectedReferenceId: 'ref-2',
}), true)
assert.equal(isReferenceDockPdfSelected({
  referenceDockPdfOpen: true,
  referenceDockPdfReferenceId: 'ref-2',
  selectedReferenceId: 'ref-1',
}), false)
assert.deepEqual(buildReferenceDockPdfSnapshotState({
  references,
  referenceDockPdfOpen: true,
  referenceDockPdfReferenceId: 'missing',
  selectedReferenceId: 'ref-1',
  referenceDockActivePage: 'pdf',
}), {
  referenceDockPdfOpen: false,
  referenceDockPdfReferenceId: '',
  shouldFallbackToDetails: false,
})
assert.deepEqual(buildReferenceDockPdfSnapshotState({
  references,
  referenceDockPdfOpen: true,
  referenceDockPdfReferenceId: 'ref-2',
  selectedReferenceId: 'ref-1',
  referenceDockActivePage: 'pdf',
}), {
  referenceDockPdfOpen: true,
  referenceDockPdfReferenceId: 'ref-2',
  shouldFallbackToDetails: true,
})
assert.equal(buildReferenceDockPdfSnapshotState({
  references,
  referenceDockPdfOpen: true,
  referenceDockPdfReferenceId: 'ref-2',
  selectedReferenceId: 'ref-2',
  referenceDockActivePage: 'pdf',
}).shouldFallbackToDetails, false)
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
assert.equal(buildDefaultResolvedQueryState({ sortKey: 'invalid' }).query.sortKey, 'year-desc')
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

const fallbackResolvedQueryState = resolveReferenceResolvedQueryState(null, {
  references,
  selectedReferenceId: 'ref-3',
  sortKey: 'invalid',
})
assert.equal(fallbackResolvedQueryState.query.selectedReferenceId, 'ref-3')
assert.equal(fallbackResolvedQueryState.query.sortKey, 'year-desc')
assert.deepEqual(fallbackResolvedQueryState.filteredReferences, references)

const explicitResolvedQueryState = {
  selectedReferenceId: 'root-ref',
  query: {
    selectedSectionKey: 'recent',
    selectedSourceKey: 'zotero',
    selectedCollectionKey: 'methods',
    selectedTagKey: 'theory',
    sortKey: 'invalid',
    selectedReferenceId: 'query-ref',
  },
}
assert.equal(
  resolveReferenceResolvedQueryState(explicitResolvedQueryState, { references }),
  explicitResolvedQueryState,
)
assert.deepEqual(buildReferenceQuerySelectionState(explicitResolvedQueryState, {
  selectedReferenceId: 'current-ref',
}), {
  selectedSectionKey: 'recent',
  selectedSourceKey: 'zotero',
  selectedCollectionKey: 'methods',
  selectedTagKey: 'theory',
  sortKey: 'year-desc',
  selectedReferenceId: 'root-ref',
})
assert.equal(buildReferenceQuerySelectionState({
  query: { selectedReferenceId: 'query-ref' },
}, {
  selectedReferenceId: 'current-ref',
}).selectedReferenceId, 'query-ref')
assert.equal(buildReferenceQuerySelectionState({}, {
  selectedReferenceId: 'current-ref',
}).selectedReferenceId, 'current-ref')

assert.deepEqual(buildReferenceSectionSelectionState({
  librarySections: sections,
}, ' recent '), {
  selectedSectionKey: 'recent',
  selectedSourceKey: '',
  selectedCollectionKey: '',
  selectedTagKey: '',
})
assert.deepEqual(buildReferenceSectionSelectionState({
  librarySections: sections,
}, 'missing'), {
  selectedSectionKey: 'all',
  selectedSourceKey: '',
  selectedCollectionKey: '',
  selectedTagKey: '',
})
assert.deepEqual(buildReferenceSourceSelectionState({
  sourceSections: [{ key: 'manual' }, { key: 'zotero' }],
}, 'zotero'), {
  selectedSectionKey: 'all',
  selectedSourceKey: 'zotero',
  selectedCollectionKey: '',
  selectedTagKey: '',
})
assert.deepEqual(buildReferenceSourceSelectionState({
  sourceSections: [{ key: 'manual' }],
}, 'missing'), {
  selectedSectionKey: 'all',
  selectedSourceKey: '',
  selectedCollectionKey: '',
  selectedTagKey: '',
})
assert.deepEqual(buildReferenceCollectionSelectionState({
  collections,
}, 'Machine Learning'), {
  selectedSectionKey: 'all',
  selectedSourceKey: '',
  selectedCollectionKey: 'ml',
  selectedTagKey: '',
})
assert.deepEqual(buildReferenceCollectionSelectionState({
  collections,
}, 'missing'), {
  selectedSectionKey: 'all',
  selectedSourceKey: '',
  selectedCollectionKey: '',
  selectedTagKey: '',
})
assert.deepEqual(buildReferenceTagSelectionState({
  tags,
}, ' THEORY '), {
  selectedSectionKey: 'all',
  selectedSourceKey: '',
  selectedCollectionKey: '',
  selectedTagKey: 'theory',
})
assert.deepEqual(buildReferenceTagSelectionState({
  tags,
}, 'missing'), {
  selectedSectionKey: 'all',
  selectedSourceKey: '',
  selectedCollectionKey: '',
  selectedTagKey: '',
})
assert.deepEqual(buildReferenceSortSelectionState('author-asc'), { sortKey: 'author-asc' })
assert.deepEqual(buildReferenceSortSelectionState('bad-sort'), { sortKey: 'year-desc' })
assert.equal(resolveReferenceSelectionId(references, ' ref-2 ', 'ref-1'), 'ref-2')
assert.equal(resolveReferenceSelectionId(references, 'missing', 'ref-1'), 'ref-1')
assert.deepEqual(buildReferenceSnapshotSelectionState({
  collections,
  tags,
  sourceSections: [{ key: 'manual' }, { key: 'zotero' }],
  references,
  selectedCollectionKey: 'machine learning',
  selectedTagKey: 'theory',
  selectedSourceKey: 'zotero',
  selectedReferenceId: 'ref-2',
}), {
  selectedCollectionKey: 'machine learning',
  selectedTagKey: 'theory',
  selectedSourceKey: 'zotero',
  selectedReferenceId: 'ref-2',
})
assert.deepEqual(buildReferenceSnapshotSelectionState({
  collections,
  tags,
  sourceSections: [{ key: 'manual' }],
  references,
  selectedCollectionKey: 'missing',
  selectedTagKey: 'missing',
  selectedSourceKey: 'zotero',
  selectedReferenceId: 'missing',
}), {
  selectedCollectionKey: '',
  selectedTagKey: '',
  selectedSourceKey: '',
  selectedReferenceId: '',
})
assert.equal(buildReferenceSnapshotSelectionState({
  references,
  preferredSelectedReferenceId: 'external-ref',
}).selectedReferenceId, 'external-ref')
assert.deepEqual(buildReferenceLibrarySnapshotPayload({
  citationStyle: 'ieee',
  documentReferenceSelections,
  collections,
  tags,
  references,
}), {
  version: 2,
  citationStyle: 'ieee',
  documentReferenceSelections,
  collections,
  tags,
  references,
})
assert.deepEqual(buildReferenceStoreInitialState({
  librarySections: sections,
  sourceSections: [{ key: 'manual' }],
  collections,
  tags,
  references,
}), {
  librarySections: sections,
  sourceSections: [{ key: 'manual' }],
  collections,
  tags,
  references,
  documentReferenceSelections: {},
  citationStyle: 'apa',
  selectedSectionKey: 'all',
  selectedSourceKey: '',
  selectedCollectionKey: '',
  selectedTagKey: '',
  selectedReferenceId: 'ref-1',
  referenceDockPdfOpen: false,
  referenceDockPdfReferenceId: '',
  sortKey: 'year-desc',
  resolvedQueryState: buildDefaultResolvedQueryState({
    librarySections: sections,
    sourceSections: [{ key: 'manual' }],
    collections,
    tags,
    references,
    selectedSectionKey: 'all',
    selectedSourceKey: '',
    selectedCollectionKey: '',
    selectedTagKey: '',
    sortKey: 'year-desc',
  }),
  isLoading: false,
  loadError: '',
  zoteroSyncStatus: 'disconnected',
  zoteroSyncLastSyncTime: '',
  zoteroSyncError: '',
  zoteroSyncErrorType: '',
  zoteroMutationError: '',
  importInFlight: false,
  availableCitationStylesList: [],
})
assert.deepEqual(buildReferenceStoreCleanupState({
  librarySections: [{ key: 'all' }, { key: 'recent' }],
  sourceSections: [{ key: 'manual' }, { key: 'zotero' }],
}, {
  collections,
  tags,
  references,
}), {
  collections,
  tags,
  references,
  documentReferenceSelections: {},
  citationStyle: 'apa',
  selectedSectionKey: 'all',
  selectedSourceKey: '',
  selectedCollectionKey: '',
  selectedTagKey: '',
  selectedReferenceId: 'ref-1',
  referenceDockPdfOpen: false,
  referenceDockPdfReferenceId: '',
  sortKey: 'year-desc',
  resolvedQueryState: buildDefaultResolvedQueryState({
    librarySections: [{ key: 'all' }, { key: 'recent' }],
    sourceSections: [{ key: 'manual' }, { key: 'zotero' }],
    collections,
    tags,
    references,
    selectedSectionKey: 'all',
    selectedSourceKey: '',
    selectedCollectionKey: '',
    selectedTagKey: '',
    sortKey: 'year-desc',
  }),
  isLoading: false,
  loadError: '',
  zoteroMutationError: '',
  importInFlight: false,
})
assert.deepEqual(buildReferenceSnapshotApplyState({
  collections,
  tags,
  sourceSections: [{ key: 'manual' }, { key: 'zotero' }],
  references,
  selectedCollectionKey: 'missing',
  selectedTagKey: 'theory',
  selectedSourceKey: 'zotero',
  selectedReferenceId: 'missing',
  referenceDockPdfOpen: true,
  referenceDockPdfReferenceId: 'ref-2',
  referenceDockActivePage: 'pdf',
}, {
  citationStyle: '',
  documentReferenceSelections: ['bad-shape'],
  collections: 'bad-shape',
  tags,
  references,
}, {
  defaultSnapshot: {
    citationStyle: 'apa',
    documentReferenceSelections,
    collections: [],
    tags: [],
    references: [],
  },
  preferredSelectedReferenceId: 'ref-1',
}), {
  collections: [],
  tags,
  references,
  documentReferenceSelections: {},
  citationStyle: 'apa',
  selectedCollectionKey: '',
  selectedTagKey: 'theory',
  selectedSourceKey: 'zotero',
  selectedReferenceId: 'ref-1',
  dockPdfState: {
    referenceDockPdfOpen: true,
    referenceDockPdfReferenceId: 'ref-2',
    shouldFallbackToDetails: true,
  },
})
const storeSource = await readFile('src/stores/references.js', 'utf8')
const domainSource = await readFile('src/domains/references/referenceStoreState.js', 'utf8')
const actionSource = (actionName) => {
  const pattern = new RegExp(`(?:async\\s+)?${actionName}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\},`)
  const match = storeSource.match(pattern)
  assert.ok(match, `references store must keep ${actionName} action visible to the contract probe`)
  return match[0]
}

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
  /buildReferenceStoreInitialState/,
  'references store must delegate initial state assembly',
)
assert.match(
  storeSource,
  /buildReferenceStoreCleanupState/,
  'references store must delegate cleanup reset state assembly',
)
assert.match(
  storeSource,
  /buildReferenceLibrarySnapshotPayload/,
  'references store must delegate library snapshot payload assembly',
)
assert.match(
  storeSource,
  /resolveReferenceResolvedQueryState/,
  'references store must delegate resolved query fallback',
)
assert.match(
  storeSource,
  /buildReferenceQuerySelectionState/,
  'references store must delegate resolved query selection hydration',
)
assert.match(
  storeSource,
  /buildReferenceSectionSelectionState/,
  'references store must delegate sidebar section selection state',
)
assert.match(
  storeSource,
  /buildReferenceSourceSelectionState/,
  'references store must delegate source selection state',
)
assert.match(
  storeSource,
  /buildReferenceCollectionSelectionState/,
  'references store must delegate collection selection state',
)
assert.match(
  storeSource,
  /buildReferenceTagSelectionState/,
  'references store must delegate tag selection state',
)
assert.match(
  storeSource,
  /buildReferenceSortSelectionState/,
  'references store must delegate sort selection state',
)
assert.match(
  storeSource,
  /resolveReferenceSelectionId/,
  'references store must delegate selected-reference id validation',
)
assert.match(
  storeSource,
  /buildReferenceSnapshotApplyState/,
  'references store must delegate snapshot apply state reconciliation',
)
assert.doesNotMatch(
  domainSource,
  /buildReferenceRemoveTargetState/,
  'referenceStoreState must not retain migrated remove-reference target helper',
)
assert.match(
  storeSource,
  /buildReferenceDockPdfOpenState/,
  'references store must delegate PDF dock open state',
)
assert.match(
  storeSource,
  /buildReferenceDockPdfCloseState/,
  'references store must delegate PDF dock close state',
)
assert.match(
  storeSource,
  /buildReferenceDockPdfResetState/,
  'references store must delegate PDF dock reset state',
)
assert.match(
  storeSource,
  /buildReferenceSnapshotApplyState/,
  'references store must delegate PDF dock snapshot reconciliation through snapshot apply state',
)
assert.match(
  storeSource,
  /isReferenceDockPdfSelected/,
  'references store must delegate PDF dock selected-tab checks',
)
assert.match(
  storeSource,
  /buildReferenceSnapshotApplyState/,
  'references store must delegate document-reference selection shape fallback through snapshot apply state',
)
assert.match(
  storeSource,
  /resolveDocumentReferenceIds/,
  'references store must delegate document-reference id resolution',
)
assert.doesNotMatch(
  domainSource,
  /buildDocumentReferenceIdsMutationState|buildAddDocumentReferenceMutationState|buildRemoveDocumentReferenceMutationState/,
  'referenceStoreState must not retain migrated document-reference mutation derivation helpers',
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
assert.doesNotMatch(
  domainSource,
  /resolveReferencesForExport|buildReferenceJsonExportTargetState/,
  'referenceStoreState must not retain migrated export target helpers',
)
assert.match(
  storeSource,
  /exportReferencesToBibTeX\(this\.references, referenceIds\)/,
  'references store must delegate BibTeX export target resolution to Rust',
)
assert.match(
  storeSource,
  /writeReferenceJsonExport\(filePath, this\.references, referenceId\)/,
  'references store must delegate JSON export target resolution to Rust',
)
assert.match(
  storeSource,
  /formatReferenceCitationById/,
  'references store must delegate citation target lookup to the Rust citation bridge',
)
assert.doesNotMatch(
  domainSource,
  /buildReferenceImportInputState|buildReferenceEmptyImportResult/,
  'referenceStoreState must not retain migrated import input preflight or empty-result helpers',
)
assert.match(
  storeSource,
  /mutation\?\.result\?\.emptyImport === true[\s\S]*return mutation\.result/,
  'references store must consume Rust-returned empty import outcome',
)
assert.match(
  storeSource,
  /return mutation\?\.result \|\| null/,
  'references store must return Rust-returned import mutation outcome',
)
assert.match(
  storeSource,
  /preferredSelectedReferenceId: mutation\?\.result\?\.preferredSelectedReferenceId \|\| ''/,
  'references store must consume Rust-returned preferred selection for imports',
)
assert.match(
  actionSource('addReference'),
  /return mutation\?\.result\?\.selectedReference \|\| null/,
  'references store must consume Rust-returned add-reference result',
)
assert.doesNotMatch(
  domainSource,
  /buildReferenceImportMutationResultState|buildReferenceImportMutationCommitState|buildReferenceAddMutationResultState|buildReferenceImportInputState|buildReferenceEmptyImportResult/,
  'referenceStoreState must not retain migrated import/add mutation result helpers',
)
assert.doesNotMatch(
  domainSource,
  /buildReferenceMetadataRefreshTargetState/,
  'referenceStoreState must not retain migrated metadata refresh target helper',
)
assert.doesNotMatch(
  domainSource,
  /buildReferencePdfAssetTargetState|buildReferencePdfAssetResultState/,
  'referenceStoreState must not retain migrated PDF asset target/result helpers',
)
assert.match(
  storeSource,
  /storeReferencePdf\(projectRoot, \{\}, sourcePath,[\s\S]*references: this\.references,[\s\S]*referenceId,/,
  'references store must delegate PDF asset attach target lookup to Rust',
)
assert.match(
  storeSource,
  /renameReferencePdfAssetWithBackend\(projectRoot, \{\}, nextBaseName,[\s\S]*references: this\.references,[\s\S]*referenceId,/,
  'references store must delegate PDF asset rename target lookup to Rust',
)
assert.doesNotMatch(
  domainSource,
  /buildReferencePdfImportTargetState|buildReferencePdfImportResultState/,
  'referenceStoreState must not retain migrated PDF import target/result helpers',
)
assert.match(
  actionSource('importReferencePdf'),
  /const importResult = importMutation\?\.result \|\| \{\}[\s\S]*const importedSnapshot = importMutation\?\.snapshot \|\| this\.buildLibrarySnapshotPayload\(\)/,
  'importReferencePdf must consume Rust-returned PDF import mutation result and snapshot',
)
assert.match(
  actionSource('importReferencePdf'),
  /storeReferencePdf\(projectRoot, \{\}, sourcePath,[\s\S]*references: importedSnapshot\?\.references,[\s\S]*referenceId: selectedReferenceId,/,
  'importReferencePdf must delegate imported PDF asset target lookup to Rust',
)
assert.match(
  actionSource('createCollection'),
  /mutation\?\.result\?\.changed === true[\s\S]*return mutation\?\.result\?\.collection \|\| null/,
  'createCollection must consume the Rust-returned collection mutation outcome',
)
assert.match(
  actionSource('renameCollection'),
  /mutation\?\.result\?\.changed === true[\s\S]*return mutation\?\.result\?\.collection \|\| null/,
  'renameCollection must consume the Rust-returned collection mutation outcome',
)
assert.match(
  actionSource('removeCollection'),
  /mutation\?\.result\?\.removed !== true/,
  'removeCollection must consume the Rust-returned removal outcome',
)
assert.match(
  actionSource('setDocumentReferenceIds'),
  /mutation\?\.result\?\.changed !== true[\s\S]*return false[\s\S]*commitReferenceMutationSnapshot\(this, projectRoot, mutation,/,
  'setDocumentReferenceIds must consume the Rust-returned document-reference mutation outcome',
)
assert.match(
  actionSource('updateReference'),
  /mutation\?\.result\?\.changed !== true[\s\S]*mutation\?\.result\?\.preferredSelectedReferenceId \|\| ''/,
  'updateReference must consume Rust-returned changed and preferred-selection outcome',
)
assert.match(
  actionSource('removeReference'),
  /mutation\?\.result\?\.removed !== true[\s\S]*mutation\?\.result\?\.preferredSelectedReferenceId \|\| ''/,
  'removeReference must consume Rust-returned removed and preferred-selection outcome',
)
assert.match(
  actionSource('removeReference'),
  /const zoteroDeleteReference = mutation\?\.result\?\.zoteroDeleteReference[\s\S]*deleteFromZotero\(zoteroDeleteReference\)/,
  'removeReference must consume Rust-returned Zotero delete target',
)
assert.doesNotMatch(
  actionSource('removeReference'),
  /buildReferenceRemoveTargetState|targetState\.|resolveReferenceById\(this\.references|String\(referenceId \|\| ''\)\.trim\(\)|_pushedByApp|_zoteroKey/,
  'removeReference must not inline target lookup or Zotero delete side-effect gating',
)
assert.match(
  actionSource('toggleReferenceCollection'),
  /mutation\?\.result\?\.changed !== true[\s\S]*return mutation\?\.result\?\.toggledOn === true/,
  'toggleReferenceCollection must consume the Rust-returned toggle outcome',
)
for (const actionName of [
  'createCollection',
  'renameCollection',
  'removeCollection',
  'setDocumentReferenceIds',
  'addDocumentReference',
  'removeDocumentReference',
  'addReference',
  'updateReference',
  'removeReference',
  'toggleReferenceCollection',
]) {
  assert.match(
    actionSource(actionName),
    /selectedReferenceId: this\.selectedReferenceId/,
    `${actionName} must pass current selection to Rust mutation authority`,
  )
}
assert.doesNotMatch(
  domainSource,
  /buildReferenceUpdateMutationCommitState|buildReferenceUpdateMutationResultState|buildReferenceRemoveMutationCommitState|buildReferenceRemoveMutationResultState|buildReferenceCollectionMutationResultState|buildReferenceRemoveCollectionMutationResultState|buildReferenceDocumentIdsMutationResultState|buildReferenceToggleCollectionMutationResultState/,
  'referenceStoreState must not retain migrated mutation outcome or commit-selection helpers',
)
assert.doesNotMatch(
  domainSource,
  /buildReferenceZoteroSyncResultState/,
  'referenceStoreState must not retain migrated Zotero sync result helper',
)
assert.match(
  actionSource('syncZoteroNow'),
  /const syncState = result \|\| \{\}/,
  'syncZoteroNow must consume Rust-returned Zotero sync state directly',
)
assert.match(
  storeSource,
  /resolveReferenceCitationStyleId/,
  'references store must delegate citation-style fallback state',
)
assert.match(
  storeSource,
  /resolveReferenceWorkspaceCitationStyles/,
  'references store must delegate workspace citation-style list fallback',
)
assert.match(
  storeSource,
  /resolveSelectedReference/,
  'references store must delegate selected-reference fallback lookup',
)
assert.match(
  storeSource,
  /resolveReferenceCitationUsageKeys/,
  'references store must delegate citation usage key derivation',
)
assert.match(
  storeSource,
  /buildReferenceSortSelectionState/,
  'references store must delegate sort key validation',
)
assert.doesNotMatch(
  storeSource,
  /function normalizeCollectionMembershipValue|function normalizeTagKey|function resolveCollection|function resolveDocumentReferenceSelections|function buildDefaultResolvedQueryState|version:\s*2|citationStyle:\s*'apa'|documentReferenceSelections:\s*\{\}|Array\.isArray\(normalized\.(?:collections|tags|references)\)|Array\.isArray\(importedReferences\)|Array\.isArray\(referenceStyles\)|Array\.isArray\(styles\)|Array\.isArray\(importedSnapshot\?\.references\)|String\(normalized\.citationStyle \|\| 'apa'\)|const selectedIds = new Set\(this\.getDocumentReferenceIds|const normalizedQuery = String\(query \|\| ''\)\.trim\(\)\.toLowerCase\(\)|haystack\.includes\(normalizedQuery\)|referenceIds\s*\.map\(\(referenceId\) => this\.references\.find|this\.references\.some\(\(reference\) => reference\.id|this\.(?:librarySections|sourceSections)\.some\(\(section\) => section\.key|resolveReferenceSectionKey|\[\s*'year-desc'[\s\S]*'author-desc'[\s\S]*\]\.includes\(value\)|const query = this\.resolvedQueryState\?\.query|query\.selectedReferenceId|query\.selectedSectionKey|const normalized = normalizeTagKey\(tagKey\)|this\.sortKey = normalizeReferenceSortKey\(value\)|resolveReferenceById\(state\.references|this\.filteredReferences\[0\]|new Set\(Object\.keys\(this\.citedIn\)\)|buildReferenceImportMutationResultState\(this\.references|buildReferenceAddMutationResultState\(this\.references|buildReferenceImportMutationCommitState\(mutation\)|Number\(result\?\.imported \|\| 0\)|Number\(result\?\.linked \|\| 0\)|Number\(result\?\.updated \|\| 0\)|resolveReferencesForExport\(this\.references|buildReferenceJsonExportTargetState\(this\.references/,
  'references store must not redefine deterministic state helpers inline',
)
assert.doesNotMatch(
  actionSource('importReferencePdf'),
  /buildReferencePdfImportTargetState|buildReferencePdfImportResultState|String\(importMutation\?\.result\?\.selectedReferenceId \|\| ''\)|Array\.isArray\(importedSnapshot\?\.references\)|resolveReferenceById\(importedSnapshot\.references|resolveReferenceById\(this\.references,|importTarget\./,
  'importReferencePdf must not inline PDF import target/result state mapping',
)
assert.doesNotMatch(
  storeSource,
  /async function commitImportedReferences[\s\S]*?const selectedReferenceId = String\(mutation\?\.result\?\.selectedReferenceId \|\| ''\)/,
  'commitImportedReferences must not inline import mutation commit selection',
)
assert.doesNotMatch(
  actionSource('addReference'),
  /String\(mutation\?\.result\?\.selectedReferenceId \|\| ''\)|resolveReferenceById\(this\.references, selectedReferenceId\)/,
  'addReference must not inline add-reference mutation result mapping',
)
assert.doesNotMatch(
  actionSource('refreshReferenceMetadata'),
  /buildReferenceMetadataRefreshTargetState|String\(referenceId \|\| ''\)\.trim\(\)|resolveReferenceById\(this\.references|targetState\./,
  'refreshReferenceMetadata must not inline metadata refresh target state mapping',
)
assert.match(
  actionSource('refreshReferenceMetadata'),
  /refreshReferenceMetadataWithBackend\(\{[\s\S]*references: this\.references,[\s\S]*referenceId,/,
  'refreshReferenceMetadata must pass references and referenceId to Rust for target resolution',
)
for (const actionName of ['attachReferencePdf', 'renameReferencePdfAsset']) {
  assert.doesNotMatch(
    actionSource(actionName),
    /buildReferencePdfAssetTargetState|buildReferencePdfAssetResultState|resolveReferenceById\(this\.references|String\(referenceId \|\| ''\)\.trim\(\)/,
    `${actionName} must not inline PDF asset target/result state mapping`,
  )
}
assert.doesNotMatch(
  actionSource('syncZoteroNow'),
  /buildReferenceZoteroSyncResultState|result\?\.skipped === true|Number\(result\?\.(?:imported|linked|updated) \|\| 0\)|this\.zoteroSyncStatus = 'synced'|this\.zoteroSyncStatus = 'disconnected'|new Date\(\)\.toISOString\(\)|fallbackLastSyncTime/,
  'syncZoteroNow must not inline Zotero sync result state mapping',
)
assert.doesNotMatch(
  actionSource('setCitationStyle'),
  /this\.citationStyle = info \? normalized : 'apa'/,
  'setCitationStyle must not inline citation-style fallback state',
)
for (const actionName of ['setSelectedSource', 'setSelectedCollection', 'setSelectedTag']) {
  assert.doesNotMatch(
    actionSource(actionName),
    /this\.selectedSectionKey = 'all'[\s\S]*this\.selectedSourceKey = ''[\s\S]*this\.selectedCollectionKey = ''/,
    `${actionName} must not inline sidebar selection reset rules`,
  )
}
assert.doesNotMatch(
  actionSource('selectReference'),
  /const normalizedReferenceId = String\(referenceId \|\| ''\)\.trim\(\)/,
  'selectReference must not inline selected-reference id validation',
)
assert.doesNotMatch(
  actionSource('updateReference'),
  /preferredSelectedReferenceId !== undefined[\s\S]*this\.selectedReferenceId \|\| mutation\?\.result\?\.selectedReferenceId/,
  'updateReference must not inline mutation commit selection fallback',
)
assert.doesNotMatch(
  actionSource('removeReference'),
  /this\.selectedReferenceId === referenceId[\s\S]*\? ''[\s\S]*: this\.selectedReferenceId/,
  'removeReference must not inline mutation commit selection fallback',
)
assert.doesNotMatch(
  actionSource('removeReference'),
  /resolveReferenceById\(this\.references, referenceId\)|const target =/,
  'removeReference must not inline target lookup',
)
assert.doesNotMatch(
  actionSource('writeReferenceJsonExportFile'),
  /resolveReferenceById\(this\.references, referenceId\)|const reference =/,
  'writeReferenceJsonExportFile must not inline JSON export target lookup',
)
assert.doesNotMatch(
  actionSource('formatReferenceCitationAsync'),
  /resolveReferenceById\(this\.references, referenceId\)|const reference =/,
  'formatReferenceCitationAsync must not inline citation formatting target lookup',
)
for (const actionName of ['setDocumentReferenceIds', 'addDocumentReference', 'removeDocumentReference']) {
  assert.match(
    actionSource(actionName),
    /mutation\?\.result\?\.changed !== true[\s\S]*return false[\s\S]*commitReferenceMutationSnapshot\(this, projectRoot, mutation,/,
    `${actionName} must consume Rust-returned document-reference mutation outcome before committing`,
  )
  assert.doesNotMatch(
    actionSource(actionName),
    /buildDocumentReferenceIdsMutationState|buildAddDocumentReferenceMutationState|buildRemoveDocumentReferenceMutationState|String\(texPath \|\| ''\)\.trim\(\)|String\(referenceId \|\| ''\)\.trim\(\)|ids\.includes|ids\.filter\(\(id\) => id !==|resolveDocumentReferenceIds\(this\.documentReferenceSelections/,
    `${actionName} must not inline document-reference mutation derivation`,
  )
}
for (const actionName of ['openReferenceDockPdf', 'closeReferenceDockPdf', 'resetReferenceDockTabs']) {
  assert.doesNotMatch(
    actionSource(actionName),
    /String\(referenceId \|\| ''\)\.trim\(\)|this\.referenceDockPdfOpen = false\s*\n\s*this\.referenceDockPdfReferenceId = ''|this\.referenceDockPdfOpen = true/,
    `${actionName} must not inline PDF dock state derivation`,
  )
}
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
    selectedReferenceFallbackDerived: true,
    rustDocumentReferenceMutationDerivation: true,
    documentReferenceLookupDerived: true,
    citationUsageKeysDerived: true,
    referenceSearchDerived: true,
    rustExportTargetResolution: true,
    citationFormatTargetStateDerived: true,
    rustImportOutcomeConsumed: true,
    rustImportPreferredSelectionConsumed: true,
    rustAddReferenceOutcomeConsumed: true,
    metadataRefreshTargetStateDerived: true,
    rustPdfAssetTargetResolution: true,
    rustRemoveReferenceTargetState: true,
    rustRemoveReferenceOutcomeConsumed: true,
    rustUpdateReferenceOutcomeConsumed: true,
    rustPdfImportTargetAndResult: true,
    rustCollectionMutationOutcomeConsumed: true,
    rustRemoveCollectionOutcomeConsumed: true,
    rustDocumentIdsMutationOutcomeConsumed: true,
    rustToggleCollectionOutcomeConsumed: true,
    citationStyleStateDerived: true,
    rustZoteroSyncResultState: true,
    defaultQueryStateDerived: true,
    resolvedQueryHydrationDerived: true,
    sidebarSelectionDerived: true,
    snapshotSelectionDerived: true,
    rustMutationPreferredSelectionConsumed: true,
    pdfDockStateDerived: true,
    storeLifecycleStateDerived: true,
    snapshotPayloadDerived: true,
    storeUsesDomainHelper: true,
    exactIdPresenceDerived: true,
    sectionAndSortKeyValidationDerived: true,
    storageRootRemainsStoreScoped: true,
  },
}, null, 2))
