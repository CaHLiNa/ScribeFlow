import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildAddDocumentReferenceMutationState,
  buildDefaultResolvedQueryState,
  buildDocumentReferenceIdsMutationState,
  buildReferenceEmptyImportResult,
  buildReferenceImportInputState,
  buildReferenceImportMutationResultState,
  buildReferenceAddMutationResultState,
  buildReferenceCollectionMutationResultState,
  buildReferenceDocumentIdsMutationResultState,
  buildReferencePdfImportTargetState,
  buildReferenceRemoveCollectionMutationResultState,
  buildReferenceToggleCollectionMutationResultState,
  buildReferenceZoteroSyncResultState,
  resolveReferenceCitationStyleId,
  resolveReferenceWorkspaceCitationStyles,
  buildRemoveDocumentReferenceMutationState,
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
  buildReferenceRemoveMutationCommitState,
  buildReferenceStoreCleanupState,
  buildReferenceStoreInitialState,
  buildReferenceTagSelectionState,
  buildReferenceUpdateMutationCommitState,
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
  resolveReferenceResolvedQueryState,
  resolveReferenceSelectionId,
  resolveReferenceSectionKey,
  resolveReferencesForExport,
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
assert.deepEqual(resolveReferencesForExport(references, []), references)
assert.deepEqual(resolveReferencesForExport(references, ['ref-3', 'missing', 'ref-1']), [
  references[2],
  references[0],
])
assert.deepEqual(resolveReferencesForExport('not-array', ['ref-1']), [])
assert.deepEqual(buildReferenceEmptyImportResult(), {
  importedCount: 0,
  selectedReferenceId: '',
  selectedReference: null,
  reusedExisting: false,
})
assert.deepEqual(buildReferenceImportInputState([references[0]]), {
  canImport: true,
  importedReferences: [references[0]],
  emptyResult: buildReferenceEmptyImportResult(),
})
assert.deepEqual(buildReferenceImportInputState('not-array'), {
  canImport: false,
  importedReferences: [],
  emptyResult: buildReferenceEmptyImportResult(),
})
assert.deepEqual(buildReferenceImportMutationResultState(references, {
  result: {
    importedCount: '2',
    selectedReferenceId: 'ref-2',
    reusedExisting: true,
  },
}), {
  importedCount: 2,
  selectedReferenceId: 'ref-2',
  selectedReference: references[1],
  reusedExisting: true,
})
assert.deepEqual(buildReferenceImportMutationResultState(references, {
  result: {
    selectedReferenceId: 'missing',
  },
}), {
  importedCount: 0,
  selectedReferenceId: 'missing',
  selectedReference: null,
  reusedExisting: false,
})
assert.deepEqual(buildReferenceAddMutationResultState(references, {
  result: {
    selectedReferenceId: 'ref-2',
  },
}), {
  selectedReferenceId: 'ref-2',
  selectedReference: references[1],
})
assert.deepEqual(buildReferenceAddMutationResultState(references, {
  result: {
    selectedReferenceId: 'missing',
  },
}), {
  selectedReferenceId: 'missing',
  selectedReference: null,
})
assert.deepEqual(buildReferencePdfImportTargetState({
  result: {
    selectedReferenceId: ' ref-2 ',
  },
  snapshot: {
    references,
  },
}, {
  references: [references[0]],
}), {
  canImport: true,
  selectedReferenceId: 'ref-2',
  importedSnapshot: {
    references,
  },
  targetReference: references[1],
})
assert.deepEqual(buildReferencePdfImportTargetState({
  result: {
    selectedReferenceId: 'missing',
  },
}, {
  references,
}), {
  canImport: false,
  selectedReferenceId: 'missing',
  importedSnapshot: {
    references,
  },
  targetReference: null,
})
assert.deepEqual(buildReferenceCollectionMutationResultState({
  result: {
    changed: true,
    collection: collections[0],
  },
}), {
  changed: true,
  collection: collections[0],
})
assert.deepEqual(buildReferenceCollectionMutationResultState({
  result: {
    changed: 'yes',
    collection: ['bad-shape'],
  },
}), {
  changed: false,
  collection: null,
})
assert.deepEqual(buildReferenceRemoveCollectionMutationResultState({
  result: {
    removed: true,
  },
}), {
  removed: true,
})
assert.deepEqual(buildReferenceRemoveCollectionMutationResultState({
  result: {
    removed: 'yes',
  },
}), {
  removed: false,
})
assert.deepEqual(buildReferenceDocumentIdsMutationResultState({
  result: {
    changed: true,
  },
}), {
  changed: true,
})
assert.deepEqual(buildReferenceDocumentIdsMutationResultState({
  result: {
    changed: 1,
  },
}), {
  changed: false,
})
assert.deepEqual(buildReferenceToggleCollectionMutationResultState({
  result: {
    changed: true,
    toggledOn: true,
  },
}), {
  changed: true,
  toggledOn: true,
})
assert.deepEqual(buildReferenceToggleCollectionMutationResultState({
  result: {
    changed: false,
    toggledOn: 'yes',
  },
}), {
  changed: false,
  toggledOn: false,
})
assert.equal(resolveReferenceCitationStyleId(' ieee ', true), 'ieee')
assert.equal(resolveReferenceCitationStyleId(' ieee ', false), 'apa')
assert.equal(resolveReferenceCitationStyleId('  ', true), 'apa')
assert.deepEqual(resolveReferenceWorkspaceCitationStyles([{ id: 'ieee' }]), [{ id: 'ieee' }])
assert.deepEqual(resolveReferenceWorkspaceCitationStyles('not-array'), [])
assert.deepEqual(buildReferenceZoteroSyncResultState({
  imported: '2',
  linked: '1',
  selectedReferenceId: ' ref-2 ',
  snapshot: { references },
  lastSyncTime: '2026-05-18T07:30:00.000Z',
}, {
  fallbackLastSyncTime: 'fallback-time',
}), {
  skipped: false,
  snapshot: { references },
  selectedReferenceId: 'ref-2',
  zoteroSyncStatus: 'synced',
  zoteroSyncLastSyncTime: '2026-05-18T07:30:00.000Z',
  counts: {
    imported: 2,
    linked: 1,
    updated: 0,
  },
})
assert.deepEqual(buildReferenceZoteroSyncResultState({
  skipped: true,
  imported: '3',
}), {
  skipped: true,
  snapshot: {},
  selectedReferenceId: '',
  zoteroSyncStatus: 'disconnected',
  zoteroSyncLastSyncTime: '',
  counts: {
    imported: 3,
    linked: 0,
    updated: 0,
  },
})
assert.equal(buildReferenceZoteroSyncResultState({}, {
  fallbackLastSyncTime: 'fallback-time',
}).zoteroSyncLastSyncTime, 'fallback-time')
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
assert.deepEqual(buildDocumentReferenceIdsMutationState(' paper.tex ', ['ref-1']), {
  canMutate: true,
  texPath: 'paper.tex',
  referenceIds: ['ref-1'],
})
assert.deepEqual(buildDocumentReferenceIdsMutationState('', ['ref-1']), {
  canMutate: false,
  texPath: '',
  referenceIds: ['ref-1'],
})
assert.deepEqual(buildDocumentReferenceIdsMutationState('paper.tex', 'not-array'), {
  canMutate: true,
  texPath: 'paper.tex',
  referenceIds: [],
})
assert.deepEqual(buildAddDocumentReferenceMutationState(
  documentReferenceSelections,
  references,
  'paper.tex',
  ' ref-3 ',
), {
  canMutate: true,
  texPath: 'paper.tex',
  referenceIds: ['ref-1', 'ref-2', 'ref-3'],
  referenceId: 'ref-3',
})
assert.equal(buildAddDocumentReferenceMutationState(
  documentReferenceSelections,
  references,
  'paper.tex',
  'ref-2',
).canMutate, false)
assert.equal(buildAddDocumentReferenceMutationState(
  documentReferenceSelections,
  references,
  'paper.tex',
  'missing',
).canMutate, false)
assert.deepEqual(buildRemoveDocumentReferenceMutationState(
  documentReferenceSelections,
  'paper.tex',
  ' ref-2 ',
), {
  canMutate: true,
  texPath: 'paper.tex',
  referenceIds: ['ref-1'],
  referenceId: 'ref-2',
})
assert.equal(buildRemoveDocumentReferenceMutationState(
  documentReferenceSelections,
  'paper.tex',
  'missing',
).canMutate, false)
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
assert.deepEqual(buildReferenceUpdateMutationCommitState({
  selectedReferenceId: 'ref-2',
}, {
  result: {
    selectedReferenceId: 'ref-1',
  },
}), {
  preferredSelectedReferenceId: 'ref-2',
})
assert.deepEqual(buildReferenceUpdateMutationCommitState({
  selectedReferenceId: '',
}, {
  result: {
    selectedReferenceId: 'ref-1',
  },
}), {
  preferredSelectedReferenceId: 'ref-1',
})
assert.deepEqual(buildReferenceUpdateMutationCommitState({
  selectedReferenceId: 'ref-2',
}, {
  result: {
    selectedReferenceId: 'ref-1',
  },
}, {
  preferredSelectedReferenceId: null,
}), {
  preferredSelectedReferenceId: '',
})
assert.deepEqual(buildReferenceRemoveMutationCommitState({
  selectedReferenceId: ' ref-2 ',
}, 'ref-2'), {
  preferredSelectedReferenceId: '',
})
assert.deepEqual(buildReferenceRemoveMutationCommitState({
  selectedReferenceId: 'ref-2',
}, 'ref-1'), {
  preferredSelectedReferenceId: 'ref-2',
})

const storeSource = await readFile('src/stores/references.js', 'utf8')
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
assert.match(
  storeSource,
  /buildReferenceUpdateMutationCommitState/,
  'references store must delegate update mutation commit selection',
)
assert.match(
  storeSource,
  /buildReferenceRemoveMutationCommitState/,
  'references store must delegate remove mutation commit selection',
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
assert.match(
  storeSource,
  /buildDocumentReferenceIdsMutationState/,
  'references store must delegate document-reference set mutation state',
)
assert.match(
  storeSource,
  /buildAddDocumentReferenceMutationState/,
  'references store must delegate document-reference add mutation state',
)
assert.match(
  storeSource,
  /buildRemoveDocumentReferenceMutationState/,
  'references store must delegate document-reference remove mutation state',
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
  /buildReferenceImportInputState/,
  'references store must delegate import input state derivation',
)
assert.match(
  storeSource,
  /buildReferenceEmptyImportResult/,
  'references store must delegate empty import result shape',
)
assert.match(
  storeSource,
  /buildReferenceImportMutationResultState/,
  'references store must delegate import mutation result mapping',
)
assert.match(
  storeSource,
  /buildReferenceAddMutationResultState/,
  'references store must delegate add-reference mutation result mapping',
)
assert.match(
  storeSource,
  /buildReferencePdfImportTargetState/,
  'references store must delegate PDF import target state mapping',
)
assert.match(
  storeSource,
  /buildReferenceCollectionMutationResultState/,
  'references store must delegate collection mutation result state mapping',
)
assert.match(
  storeSource,
  /buildReferenceRemoveCollectionMutationResultState/,
  'references store must delegate remove-collection mutation result state mapping',
)
assert.match(
  storeSource,
  /buildReferenceDocumentIdsMutationResultState/,
  'references store must delegate document-reference id mutation result state mapping',
)
assert.match(
  storeSource,
  /buildReferenceToggleCollectionMutationResultState/,
  'references store must delegate reference collection toggle result state mapping',
)
assert.match(
  storeSource,
  /buildReferenceZoteroSyncResultState/,
  'references store must delegate Zotero sync result state mapping',
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
  /resolveReferenceById/,
  'references store must delegate exact-id reference lookup for JSON export',
)
assert.match(
  storeSource,
  /buildReferenceSortSelectionState/,
  'references store must delegate sort key validation',
)
assert.doesNotMatch(
  storeSource,
  /function normalizeCollectionMembershipValue|function normalizeTagKey|function resolveCollection|function resolveDocumentReferenceSelections|function buildDefaultResolvedQueryState|version:\s*2|citationStyle:\s*'apa'|documentReferenceSelections:\s*\{\}|Array\.isArray\(normalized\.(?:collections|tags|references)\)|Array\.isArray\(importedReferences\)|Array\.isArray\(referenceStyles\)|Array\.isArray\(styles\)|Array\.isArray\(importedSnapshot\?\.references\)|String\(normalized\.citationStyle \|\| 'apa'\)|const selectedIds = new Set\(this\.getDocumentReferenceIds|const normalizedQuery = String\(query \|\| ''\)\.trim\(\)\.toLowerCase\(\)|haystack\.includes\(normalizedQuery\)|referenceIds\s*\.map\(\(referenceId\) => this\.references\.find|this\.references\.some\(\(reference\) => reference\.id|this\.(?:librarySections|sourceSections)\.some\(\(section\) => section\.key|resolveReferenceSectionKey|\[\s*'year-desc'[\s\S]*'author-desc'[\s\S]*\]\.includes\(value\)|const query = this\.resolvedQueryState\?\.query|query\.selectedReferenceId|query\.selectedSectionKey|const normalized = normalizeTagKey\(tagKey\)|this\.sortKey = normalizeReferenceSortKey\(value\)|Number\(mutation\?\.result\?\.importedCount \|\| 0\)|Number\(result\?\.imported \|\| 0\)|Number\(result\?\.linked \|\| 0\)|Number\(result\?\.updated \|\| 0\)|reusedExisting: mutation\?\.result\?\.reusedExisting === true/,
  'references store must not redefine deterministic state helpers inline',
)
assert.doesNotMatch(
  actionSource('importReferencePdf'),
  /String\(importMutation\?\.result\?\.selectedReferenceId \|\| ''\)|Array\.isArray\(importedSnapshot\?\.references\)|resolveReferenceById\(importedSnapshot\.references/,
  'importReferencePdf must not inline PDF import target state mapping',
)
assert.doesNotMatch(
  actionSource('addReference'),
  /String\(mutation\?\.result\?\.selectedReferenceId \|\| ''\)|resolveReferenceById\(this\.references, selectedReferenceId\)/,
  'addReference must not inline add-reference mutation result mapping',
)
for (const actionName of ['createCollection', 'renameCollection']) {
  assert.doesNotMatch(
    actionSource(actionName),
    /mutation\?\.result\?\.collection && typeof mutation\.result\.collection === 'object'|mutation\?\.result\?\.changed/,
    `${actionName} must not inline collection mutation result state mapping`,
  )
}
assert.doesNotMatch(
  actionSource('removeCollection'),
  /mutation\?\.result\?\.removed/,
  'removeCollection must not inline remove-collection mutation result state mapping',
)
assert.doesNotMatch(
  actionSource('setDocumentReferenceIds'),
  /mutation\?\.result\?\.changed/,
  'setDocumentReferenceIds must not inline document-reference id mutation result state mapping',
)
assert.doesNotMatch(
  actionSource('toggleReferenceCollection'),
  /mutation\?\.result\?\.changed|mutation\?\.result\?\.toggledOn/,
  'toggleReferenceCollection must not inline reference collection toggle result state mapping',
)
assert.doesNotMatch(
  actionSource('syncZoteroNow'),
  /result\?\.skipped === true|Number\(result\?\.(?:imported|linked|updated) \|\| 0\)|this\.zoteroSyncStatus = 'synced'|this\.zoteroSyncStatus = 'disconnected'/,
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
for (const actionName of ['setDocumentReferenceIds', 'addDocumentReference', 'removeDocumentReference']) {
  assert.doesNotMatch(
    actionSource(actionName),
    /String\(texPath \|\| ''\)\.trim\(\)|String\(referenceId \|\| ''\)\.trim\(\)|ids\.includes|ids\.filter\(\(id\) => id !==/,
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
    documentReferenceMutationDerived: true,
    documentReferenceLookupDerived: true,
    referenceSearchDerived: true,
    exportSelectionDerived: true,
    importResultDerived: true,
    addReferenceResultStateDerived: true,
    pdfImportTargetStateDerived: true,
    collectionMutationResultStateDerived: true,
    removeCollectionResultStateDerived: true,
    documentIdsMutationResultStateDerived: true,
    toggleCollectionResultStateDerived: true,
    citationStyleStateDerived: true,
    zoteroSyncResultStateDerived: true,
    defaultQueryStateDerived: true,
    resolvedQueryHydrationDerived: true,
    sidebarSelectionDerived: true,
    snapshotSelectionDerived: true,
    mutationCommitSelectionDerived: true,
    pdfDockStateDerived: true,
    storeLifecycleStateDerived: true,
    snapshotPayloadDerived: true,
    storeUsesDomainHelper: true,
    exactIdPresenceDerived: true,
    sectionAndSortKeyValidationDerived: true,
    storageRootRemainsStoreScoped: true,
  },
}, null, 2))
