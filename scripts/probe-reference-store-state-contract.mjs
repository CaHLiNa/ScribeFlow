import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  resolveReferenceCitationStyleId,
  resolveReferenceWorkspaceCitationStyles,
  buildReferenceDockPdfCloseState,
  buildReferenceDockPdfOpenState,
  buildReferenceDockPdfResetState,
  buildReferenceDockPdfSnapshotState,
  buildReferenceStoreInitialState,
  isReferenceDockPdfSelected,
  resolveReferenceCitationUsageKeys,
} from '../src/domains/references/referenceStoreState.js'
import {
  buildReferenceQuerySelectionState,
  hasReferenceById,
  isReferenceSelectedForDocument,
  resolveDocumentReferenceByKey,
  resolveDocumentReferenceIds,
  resolveDocumentReferences,
  resolveReferenceByKey,
  resolveReferenceById,
  resolveReferenceResolvedQueryState,
  resolveSelectedReference,
} from '../src/domains/references/referenceResolvedQueryDto.js'

const collections = [
  { key: 'methods', label: 'Methods' },
  { key: 'ml', label: 'Machine Learning' },
]

const tags = [
  { key: 'theory', label: 'Theory' },
  { key: 'pdf', label: 'PDF' },
]

const sections = [
  { key: 'all', label: 'All' },
  { key: 'recent', label: 'Recent' },
]

const selections = {
  'paper.tex': ['ref-1', 'ref-2'],
}

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
assert.equal(resolveSelectedReference({
  filteredReferences: [references[0]],
}), null, 'selected reference must come from the Rust-returned selectedReference DTO, not filtered-row fallback')
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
const invalidResolvedQueryState = resolveReferenceResolvedQueryState(null, {
  references,
  selectedReferenceId: 'ref-3',
  sortKey: 'invalid',
})
assert.equal(invalidResolvedQueryState, null)
assert.equal(resolveReferenceResolvedQueryState(null, {
  resolvedQueryState,
}), null, 'resolved query state must only accept the Rust-returned DTO object')

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
  resolveReferenceResolvedQueryState(explicitResolvedQueryState),
  explicitResolvedQueryState,
)
assert.deepEqual(buildReferenceQuerySelectionState(explicitResolvedQueryState, {
  selectedReferenceId: 'current-ref',
}), {
  selectedSectionKey: 'recent',
  selectedSourceKey: 'zotero',
  selectedCollectionKey: 'methods',
  selectedTagKey: 'theory',
  sortKey: 'invalid',
  selectedReferenceId: 'root-ref',
})
assert.equal(buildReferenceQuerySelectionState({
  query: { selectedReferenceId: 'query-ref' },
}, {
  selectedReferenceId: 'current-ref',
}).selectedReferenceId, 'query-ref')
assert.equal(buildReferenceQuerySelectionState({}, {
  selectedReferenceId: 'current-ref',
}).selectedReferenceId, '')

assert.deepEqual(buildReferenceStoreInitialState({
  librarySections: sections,
  sourceSections: [{ key: 'manual' }],
  collections,
  tags,
  references,
}), {
  librarySections: [],
  sourceSections: [],
  collections: [],
  tags: [],
  references: [],
  documentReferenceSelections: {},
  citationStyle: '',
  selectedSectionKey: '',
  selectedSourceKey: '',
  selectedCollectionKey: '',
  selectedTagKey: '',
  selectedReferenceId: '',
  referenceDockPdfOpen: false,
  referenceDockPdfReferenceId: '',
  sortKey: '',
  resolvedQueryState: null,
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
const queryDtoSource = await readFile('src/domains/references/referenceResolvedQueryDto.js', 'utf8')
const libraryIoSource = await readFile('src/services/references/referenceLibraryIO.js', 'utf8')
const backendSource = await readFile('src-tauri/src/references_backend.rs', 'utf8')
const libSource = await readFile('src-tauri/src/lib.rs', 'utf8')
const workspaceLifecycleSource = await readFile('src/app/workspace/useWorkspaceLifecycle.js', 'utf8')
const citationPaletteSource = await readFile('src/components/editor/CitationPalette.vue', 'utf8')
const documentReferencesPanelSource = await readFile('src/components/sidebar/DocumentReferencesPanel.vue', 'utf8')
const actionSource = (actionName) => {
  const pattern = new RegExp(`(?:async\\s+)?${actionName}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\},`)
  const match = storeSource.match(pattern)
  assert.ok(match, `references store must keep ${actionName} action visible to the contract probe`)
  return match[0]
}

assert.match(
  storeSource,
  /from '..\/domains\/references\/referenceStoreState\.js'/,
  'references store must import UI state rules from the reference domain',
)
assert.match(
  storeSource,
  /from '..\/domains\/references\/referenceResolvedQueryDto\.js'/,
  'references store must read Rust-returned query DTOs through the explicit DTO reader module',
)
assert.match(
  storeSource,
  /import\s*\{[^}]*resolveReferenceCitationUsageKeys[^}]*\}\s*from '..\/domains\/references\/referenceStoreState\.js'/,
  'citation usage display helpers must stay with UI state helpers',
)
assert.doesNotMatch(
  storeSource,
  /import\s*\{[^}]*resolveReferenceCitationUsageKeys[^}]*\}\s*from '..\/domains\/references\/referenceResolvedQueryDto\.js'/,
  'referenceResolvedQueryDto must not export UI display helpers',
)
assert.doesNotMatch(
  storeSource,
  /buildDefaultResolvedQueryState/,
  'references store must not build fallback/default query DTOs in JS',
)
assert.doesNotMatch(
  domainSource,
  /buildDefaultResolvedQueryState|resolveReferenceStoreSeed|buildReferenceStoreResetQueryState|normalizeCollectionMembershipValue|normalizeTagKey|normalizeReferenceSortKey|resolveCollection|resolveTag|resolveReferenceSectionKey|resolveDocumentReferenceSelections/,
  'referenceStoreState must not retain migrated key normalization or default query adapters',
)
assert.doesNotMatch(
  domainSource,
  /resolveDocumentReferenceEntry|resolveLookupEntry|resolveDocumentReferenceIds|resolveDocumentReferences|resolveReferenceByKey|resolveReferenceById|hasReferenceById|resolveSelectedReference|resolveDocumentReferenceByKey|isReferenceSelectedForDocument|searchReferences|resolveAvailableDocumentReferences|resolveReferenceResolvedQueryState|buildReferenceQuerySelectionState/,
  'referenceStoreState must stay limited to UI state helpers and must not regain Rust query DTO readers',
)
assert.match(
  queryDtoSource,
  /resolveDocumentReferenceIds/,
  'referenceResolvedQueryDto must expose document-reference DTO readers for synchronous editor APIs',
)
assert.doesNotMatch(
  queryDtoSource,
  /searchReferences|resolveAvailableDocumentReferences|referenceSearchIndex|normalizedQuery|\.includes\(/,
  'referenceResolvedQueryDto must not own reference search or available-reference filtering',
)
assert.doesNotMatch(
  queryDtoSource,
  /authors|authorLine|citationKey|identifier|pages|haystack|references\.find|references\.some|this\.references|state\.references|buildReferenceSearchIndex|reference_search_text/,
  'referenceResolvedQueryDto must not reconstruct search haystacks or scan canonical reference arrays',
)
assert.doesNotMatch(
  queryDtoSource,
  /currentState|fallbackState|filteredReferences\s*\[\s*0\s*\]/,
  'referenceResolvedQueryDto must not fall back to prior Pinia state or filtered-row selection',
)
assert.match(
  storeSource,
  /buildReferenceStoreInitialState/,
  'references store must build only the synchronous UI shell through the reference domain',
)
assert.match(
  storeSource,
  /buildReferenceStoreStateWithBackend/,
  'references store must delegate canonical initial/apply state assembly to the Rust bridge service',
)
assert.match(
  storeSource,
  /async buildStoreStateWithBackend\(/,
  'references store must expose a Rust-backed state builder action',
)
assert.match(
  storeSource,
  /async hydrateStoreState\(\)[\s\S]*await this\.buildStoreStateWithBackend\(\{\}\)/,
  'references store must hydrate canonical defaults through the Rust-backed state builder',
)
assert.match(
  workspaceLifecycleSource,
  /referencesStore\.hydrateStoreState\(\)/,
  'app startup must hydrate reference canonical defaults through Rust before workspace open',
)
assert.doesNotMatch(
  storeSource,
  /referenceLibraryFixtures|REFERENCE_LIBRARY_SECTIONS|REFERENCE_SOURCE_SECTIONS|REFERENCE_FIXTURES|REFERENCE_COLLECTIONS|REFERENCE_TAGS/,
  'references store must not import JS fixture/default library authority',
)
assert.match(
  libraryIoSource,
  /references_store_state_build/,
  'reference library IO bridge must expose the Rust-backed store state builder command',
)
assert.match(
  backendSource,
  /references_store_state_build/,
  'Rust backend must expose the store state builder command',
)
assert.match(
  libSource,
  /references_backend::references_store_state_build/,
  'Tauri invoke handler must register the store state builder command',
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
  /buildReferenceLibrarySnapshotPayloadWithBackend/,
  'references store must delegate persisted snapshot payload assembly to the Rust bridge service',
)
assert.match(
  actionSource('buildLibrarySnapshotPayload'),
  /async buildLibrarySnapshotPayload\(\)[\s\S]*buildReferenceLibrarySnapshotPayloadWithBackend\(this\.\$state\)/,
  'references store snapshot payload builder must be an async Rust-backed bridge call',
)
assert.doesNotMatch(
  domainSource,
  /buildReferenceLibrarySnapshotPayload|version:\s*2|citationStyle:\s*state\.citationStyle|documentReferenceSelections:\s*state\.documentReferenceSelections/,
  'referenceStoreState must not retain persisted snapshot payload schema assembly',
)
assert.match(
  storeSource,
  /resolveReferenceResolvedQueryState/,
  'references store must delegate resolved query DTO hydration',
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
  /buildStoreStateWithBackend\(snapshot,/,
  'applyLibrarySnapshot must delegate snapshot normalization and query hydration to Rust state assembly',
)
assert.match(
  actionSource('applyLibrarySnapshot'),
  /applyBuiltStoreState\(builtState\)/,
  'applyLibrarySnapshot must apply the Rust-built canonical store state',
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
  /buildReferenceStoreStateWithBackend/,
  'references store must delegate document-reference selection shape fallback to Rust store state assembly',
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
  /searchReferenceQueryWithBackend/,
  'references store must delegate reference search filtering to the Rust bridge',
)
assert.match(
  storeSource,
  /async searchReferenceQuery\(/,
  'references store must expose Rust-backed async reference search',
)
assert.match(
  actionSource('searchReferenceQuery'),
  /searchReferenceQueryWithBackend\(\{[\s\S]*references: this\.references,[\s\S]*documentReferenceSelections: this\.documentReferenceSelections,[\s\S]*sortKey: this\.sortKey/,
  'searchReferenceQuery must send reference search inputs to Rust',
)
assert.match(
  actionSource('searchAvailableReferencesForDocument'),
  /await this\.searchReferenceQuery\(query, \{ texPath \}\)[\s\S]*return result\.availableReferences/,
  'available-reference search must consume Rust-returned availableReferences',
)
assert.match(
  actionSource('searchRefs'),
  /await this\.searchReferenceQuery\(query\)[\s\S]*return result\.references/,
  'library search must consume Rust-returned references',
)
assert.doesNotMatch(
  citationPaletteSource,
  /referenceMatchesQuery|haystack|\.filter\(\(reference\) => referenceMatchesQuery/,
  'CitationPalette must not reconstruct reference search text in UI',
)
assert.match(
  citationPaletteSource,
  /await referencesStore\.searchReferenceQuery\([\s\S]*texPath: props\.documentPath/,
  'CitationPalette document-scoped search must use the Rust-backed search action',
)
assert.match(
  documentReferencesPanelSource,
  /await referencesStore[\s\S]*\.searchAvailableReferencesForDocument\(documentReferencePath\.value, normalizedQuery\)/,
  'DocumentReferencesPanel search must use the Rust-backed available-reference search action',
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
  /const importResult = importMutation\?\.result \|\| \{\}[\s\S]*const importedSnapshot = importMutation\?\.snapshot \|\| await this\.buildLibrarySnapshotPayload\(\)/,
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
    rustReferenceSearchFiltering: true,
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
    rustDefaultQueryState: true,
    resolvedQueryHydrationDerived: true,
    rustQuerySelectionIntentNormalization: true,
    rustSnapshotApplyNormalization: true,
    rustMutationPreferredSelectionConsumed: true,
    pdfDockStateDerived: true,
    storeLifecycleStateDerived: true,
    rustSnapshotPayloadBuild: true,
    storeUsesDomainHelper: true,
    exactIdPresenceDerived: true,
    rustQuerySectionAndSortKeyValidation: true,
    storageRootRemainsStoreScoped: true,
  },
}, null, 2))
