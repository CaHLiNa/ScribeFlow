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
  buildReferenceQuerySelectionState,
  buildReferenceStoreInitialState,
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
const resolvedQueryState = {
  sortedReferences: references,
  filteredReferences: [references[0]],
  selectedReference: references[1],
  referenceLookup: {
    byId: {
      'ref-1': references[0],
      'ref-2': references[1],
      'ref-3': references[2],
    },
    byKey: {
      lovelace2024: references[0],
      'ref-1': references[0],
      hopper2025: references[1],
      'ref-2': references[1],
      unused2026: references[2],
      'ref-3': references[2],
    },
  },
  referenceSearchIndex: {
    'ref-1': 'graph neural networks ada lovelace lovelace2024 graph',
    'ref-2': 'bayesian methods grace hopper journal of tests hopper2025',
    'ref-3': 'unused reference unused2026',
  },
  documentReferenceState: {
    byPath: {
      'paper.tex': {
        referenceIds: ['ref-1', 'ref-2'],
        references: [references[0], references[1]],
        referenceLookup: {
          byKey: {
            lovelace2024: references[0],
            'ref-1': references[0],
            hopper2025: references[1],
            'ref-2': references[1],
          },
        },
        referenceSearchIndex: {
          'ref-3': 'unused reference unused2026',
        },
        availableReferences: [references[2]],
      },
    },
    default: {
      referenceIds: [],
      references: [],
      referenceLookup: { byKey: {} },
      referenceSearchIndex: {
        'ref-1': 'graph neural networks ada lovelace lovelace2024 graph',
        'ref-2': 'bayesian methods grace hopper journal of tests hopper2025',
        'ref-3': 'unused reference unused2026',
      },
      availableReferences: references,
    },
  },
}
assert.deepEqual(resolveDocumentReferenceIds(resolvedQueryState, ' paper.tex '), ['ref-1', 'ref-2'])
assert.deepEqual(resolveDocumentReferenceIds(resolvedQueryState, ''), [])
assert.deepEqual(resolveDocumentReferences(resolvedQueryState, 'paper.tex'), [
  references[0],
  references[1],
])
assert.deepEqual(resolveDocumentReferences(resolvedQueryState, 'missing.tex'), [])
assert.deepEqual(resolveReferenceByKey(resolvedQueryState, 'lovelace2024'), references[0])
assert.deepEqual(resolveReferenceByKey(resolvedQueryState, 'ref-2'), references[1])
assert.equal(resolveReferenceByKey(resolvedQueryState, 'missing'), null)
assert.deepEqual(resolveReferenceById(resolvedQueryState, 'ref-2'), references[1])
assert.deepEqual(resolveReferenceById(resolvedQueryState, ' ref-2 '), references[1])
assert.equal(resolveReferenceById(resolvedQueryState, 'hopper2025'), null)
assert.equal(hasReferenceById(resolvedQueryState, ' ref-2 '), true)
assert.equal(hasReferenceById(resolvedQueryState, 'hopper2025'), false)
assert.equal(hasReferenceById('not-object', 'ref-2'), false)
assert.deepEqual(resolveSelectedReference(resolvedQueryState), references[1])
assert.deepEqual(resolveSelectedReference({
  filteredReferences: [references[0]],
}), references[0])
assert.equal(resolveSelectedReference({
  filteredReferences: [],
}), null)
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
assert.deepEqual(resolveDocumentReferenceByKey(resolvedQueryState, 'paper.tex', 'hopper2025'), references[1])
assert.equal(resolveDocumentReferenceByKey(resolvedQueryState, 'paper.tex', 'unused2026'), null)
assert.equal(isReferenceSelectedForDocument(resolvedQueryState, 'paper.tex', 'ref-1'), true)
assert.equal(isReferenceSelectedForDocument(resolvedQueryState, 'paper.tex', 'unused2026'), false)
assert.deepEqual(searchReferences(resolvedQueryState, 'grace'), [references[1]])
assert.deepEqual(searchReferences(resolvedQueryState, 'graph'), [references[0]])
assert.deepEqual(searchReferences(resolvedQueryState, ''), references)
assert.deepEqual(searchReferences({
  sortedReferences: references,
}, 'graph'), [])
assert.deepEqual(resolveAvailableDocumentReferences(resolvedQueryState, 'paper.tex', ''), [
  references[2],
])
assert.deepEqual(resolveAvailableDocumentReferences(resolvedQueryState, 'paper.tex', 'unused'), [
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
const storeSource = await readFile('src/stores/references.js', 'utf8')
const domainSource = await readFile('src/domains/references/referenceStoreState.js', 'utf8')
const libraryIoSource = await readFile('src/services/references/referenceLibraryIO.js', 'utf8')
const workspaceLifecycleSource = await readFile('src/app/workspace/useWorkspaceLifecycle.js', 'utf8')
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
assert.doesNotMatch(
  storeSource,
  /buildReferenceStoreCleanupState/,
  'references store must not use JS cleanup reset assembly before Rust snapshot/query normalization',
)
assert.doesNotMatch(
  domainSource,
  /buildReferenceStoreCleanupState/,
  'referenceStoreState must not retain JS cleanup reset assembly',
)
assert.match(
  actionSource('cleanup'),
  /async cleanup\(\)/,
  'references cleanup must be async so it can await Rust normalization',
)
assert.match(
  actionSource('cleanup'),
  /await this\.applyLibrarySnapshot\(\{\}, \{\s*preferredSelectedReferenceId: '',\s*\}\)/,
  'references cleanup must reset through Rust snapshot normalization and query hydration',
)
assert.match(
  workspaceLifecycleSource,
  /await referencesStore\.cleanup\(\)/,
  'workspace close must await Rust-backed reference cleanup before closing the workspace',
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
assert.doesNotMatch(
  storeSource,
  /buildReference(?:Section|Source|Collection|Tag|Sort)SelectionState|resolveReferenceSelectionId/,
  'references store must not use JS selection-validation helpers before Rust query normalization',
)
for (const actionName of [
  'setSelectedSection',
  'setSelectedSource',
  'setSelectedCollection',
  'setSelectedTag',
  'setSortKey',
]) {
  assert.match(
    actionSource(actionName),
    /await this\.refreshResolvedQueryState\(\)/,
    `${actionName} must send raw selection intent through Rust query normalization`,
  )
  assert.doesNotMatch(
    actionSource(actionName),
    /await this\.syncResolvedQueryState\(\)|resolveReferenceSectionKey|resolveCollection|resolveTag|normalizeReferenceSortKey|buildReference(?:Section|Source|Collection|Tag|Sort)SelectionState/,
    `${actionName} must not pre-validate selection intent in JS`,
  )
}
assert.match(
  actionSource('selectReference'),
  /resolveReferenceById\(\s*this\.resolvedQueryState,\s*this\.selectedReferenceId\s*\)/,
  'selectReference must use Rust-returned lookup DTOs for synchronous UI affordance only',
)
assert.match(
  actionSource('selectReference'),
  /void this\.refreshResolvedQueryState\(\)/,
  'selectReference must reconcile the raw selected-reference intent through Rust query normalization',
)
assert.match(
  actionSource('applyLibrarySnapshot'),
  /normalizeReferenceLibrarySnapshotWithBackend\(snapshot\)/,
  'applyLibrarySnapshot must delegate snapshot normalization to Rust when applying raw snapshots',
)
assert.match(
  actionSource('applyLibrarySnapshot'),
  /await this\.refreshResolvedQueryState\(\)/,
  'applyLibrarySnapshot must hydrate selection and filters through Rust query normalization',
)
assert.match(
  actionSource('applyLibrarySnapshot'),
  /buildReferenceDockPdfSnapshotState/,
  'applyLibrarySnapshot may keep PDF dock reconciliation as a UI helper',
)
assert.doesNotMatch(
  storeSource,
  /buildReferenceSnapshotApplyState|buildReferenceSnapshotSelectionState|buildDefaultReferenceLibrarySnapshot/,
  'references store must not use JS snapshot apply/default helpers before Rust normalization',
)
assert.doesNotMatch(
  domainSource,
  /buildReferenceSnapshotApplyState|buildReferenceSnapshotSelectionState/,
  'referenceStoreState must not retain snapshot apply or selection reconciliation helpers',
)
assert.doesNotMatch(
  libraryIoSource,
  /buildDefaultReferenceLibrarySnapshot|version:\s*2|citationStyle:\s*'apa'|documentReferenceSelections:\s*\{\}/,
  'reference library IO service must not hardcode the default snapshot shape in JS',
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
  /buildReferenceDockPdfSnapshotState/,
  'references store must delegate PDF dock snapshot reconciliation to a UI helper',
)
assert.match(
  storeSource,
  /isReferenceDockPdfSelected/,
  'references store must delegate PDF dock selected-tab checks',
)
assert.match(
  storeSource,
  /normalizeReferenceLibrarySnapshotWithBackend/,
  'references store must delegate document-reference selection shape fallback to Rust snapshot normalization',
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
  /selectedCollection:\s*\(state\) => state\.resolvedQueryState\?\.selectedCollection \|\| null/,
  'references store must consume Rust-returned selected collection',
)
assert.match(
  storeSource,
  /selectedTag:\s*\(state\) => state\.resolvedQueryState\?\.selectedTag \|\| null/,
  'references store must consume Rust-returned selected tag',
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
  /resolveSelectedReference\(state\.resolvedQueryState\)/,
  'references store must consume Rust-returned selected-reference lookup state',
)
assert.match(
  storeSource,
  /resolveReferenceCitationUsageKeys/,
  'references store must delegate citation usage key derivation',
)
assert.doesNotMatch(
  storeSource,
  /function normalizeCollectionMembershipValue|function normalizeTagKey|function resolveCollection|function resolveDocumentReferenceSelections|function buildDefaultResolvedQueryState|version:\s*2|citationStyle:\s*'apa'|documentReferenceSelections:\s*\{\}|Array\.isArray\(normalized\.(?:collections|tags|references)\)|Array\.isArray\(importedReferences\)|Array\.isArray\(referenceStyles\)|Array\.isArray\(styles\)|Array\.isArray\(importedSnapshot\?\.references\)|String\(normalized\.citationStyle \|\| 'apa'\)|const selectedIds = new Set\(this\.getDocumentReferenceIds|const normalizedQuery = String\(query \|\| ''\)\.trim\(\)\.toLowerCase\(\)|haystack\.includes\(normalizedQuery\)|referenceIds\s*\.map\(\(referenceId\) => this\.references\.find|this\.references\.some\(\(reference\) => reference\.id|this\.(?:librarySections|sourceSections)\.some\(\(section\) => section\.key|resolveReferenceSectionKey|\[\s*'year-desc'[\s\S]*'author-desc'[\s\S]*\]\.includes\(value\)|const query = this\.resolvedQueryState\?\.query|query\.selectedReferenceId|query\.selectedSectionKey|const normalized = normalizeTagKey\(tagKey\)|this\.sortKey = normalizeReferenceSortKey\(value\)|resolveReferenceById\(state\.references|this\.filteredReferences\[0\]|new Set\(Object\.keys\(this\.citedIn\)\)|resolveCollection\(state\.collections|resolveTag\(state\.tags|resolveReferenceByKey\(this\.references|resolveDocumentReferenceIds\(this\.documentReferenceSelections|resolveDocumentReferences\(this\.documentReferenceSelections|resolveAvailableDocumentReferences\(this\.documentReferenceSelections|searchReferences\(this\.sortedLibrary|authors|authorLine|citationKey|identifier|pages|resolveReferenceByKey\(this\.references|buildReferenceImportMutationResultState\(this\.references|buildReferenceAddMutationResultState\(this\.references|buildReferenceImportMutationCommitState\(mutation\)|Number\(result\?\.imported \|\| 0\)|Number\(result\?\.linked \|\| 0\)|Number\(result\?\.updated \|\| 0\)|resolveReferencesForExport\(this\.references|buildReferenceJsonExportTargetState\(this\.references/,
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
      /resolveReferenceSectionKey|resolveCollection|resolveTag|normalizeTagKey|buildReference(?:Source|Collection|Tag)SelectionState/,
      `${actionName} must not pre-validate sidebar selection intent in JS`,
    )
  }
assert.doesNotMatch(
  actionSource('selectReference'),
  /const normalizedReferenceId = String\(referenceId \|\| ''\)\.trim\(\)|this\.references\.some\(/,
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
    rustQuerySelectionIntentNormalization: true,
    rustSnapshotApplyNormalization: true,
    rustMutationPreferredSelectionConsumed: true,
    pdfDockStateDerived: true,
    storeLifecycleStateDerived: true,
    snapshotPayloadDerived: true,
    storeUsesDomainHelper: true,
    exactIdPresenceDerived: true,
    rustQuerySectionAndSortKeyValidation: true,
    storageRootRemainsStoreScoped: true,
  },
}, null, 2))
