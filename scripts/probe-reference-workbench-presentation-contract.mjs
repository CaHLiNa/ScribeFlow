import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  REFERENCE_WORKBENCH_DETAIL_CLOSE_RESET_DELAY_MS,
  buildReferenceContextMenuGroups,
  buildReferenceDetailResizeConstraints,
  buildReferenceDetailResizePayload,
  buildReferenceExportDefaultPath,
  normalizeReferenceFilenameSegment,
  referenceIsInCollection,
  resolveNextReferenceSortKey,
  resolveReferenceCitedInFiles,
  resolveReferenceDetailDockWidth,
  resolveReferenceDetailMaxWidth,
  resolveReferencePdfPath,
  shouldReconcileReferenceDetailWidth,
} from '../src/domains/references/referenceWorkbenchPresentation.js'

assert.equal(REFERENCE_WORKBENCH_DETAIL_CLOSE_RESET_DELAY_MS, 680)

assert.equal(resolveReferenceDetailDockWidth(360), 420)
assert.equal(resolveReferenceDetailDockWidth(480), 480)
assert.equal(resolveReferenceDetailMaxWidth(1200), 624)
assert.equal(resolveReferenceDetailMaxWidth(900), 420)
assert.equal(resolveReferenceDetailMaxWidth(0), Number.MAX_SAFE_INTEGER)
assert.deepEqual(buildReferenceDetailResizeConstraints({ containerWidth: 1280 }), {
  containerWidth: 1280,
  minDockWidth: 420,
  minMainWidth: 520,
  maxContainerRatio: 0.52,
})
assert.deepEqual(buildReferenceDetailResizePayload({ width: 360, containerWidth: 1280 }), {
  width: 360,
  containerWidth: 1280,
  minDockWidth: 420,
  minMainWidth: 520,
  maxContainerRatio: 0.52,
})
assert.equal(
  shouldReconcileReferenceDetailWidth({
    isOpen: false,
    width: 360,
    containerWidth: 1280,
  }),
  false,
)
assert.equal(
  shouldReconcileReferenceDetailWidth({
    isOpen: true,
    width: 360,
    containerWidth: 1280,
  }),
  true,
)
assert.equal(
  shouldReconcileReferenceDetailWidth({
    isOpen: true,
    width: 500,
    containerWidth: 1280,
  }),
  false,
)
assert.equal(
  shouldReconcileReferenceDetailWidth({
    isOpen: true,
    width: 900,
    containerWidth: 1280,
  }),
  true,
)

assert.equal(resolveNextReferenceSortKey('title-asc', 'title'), 'title-desc')
assert.equal(resolveNextReferenceSortKey('title-desc', 'title'), 'title-asc')
assert.equal(resolveNextReferenceSortKey('author-asc', 'author'), 'author-desc')
assert.equal(resolveNextReferenceSortKey('author-desc', 'author'), 'author-asc')
assert.equal(resolveNextReferenceSortKey('year-desc', 'year'), 'year-asc')
assert.equal(resolveNextReferenceSortKey('year-asc', 'year'), 'year-desc')
assert.equal(resolveNextReferenceSortKey('source-asc', 'unknown'), 'source-asc')

assert.equal(resolveReferencePdfPath({ pdfPath: ' /tmp/paper.pdf ' }), '/tmp/paper.pdf')
assert.equal(resolveReferencePdfPath({ pdfPath: '   ' }), '')
assert.deepEqual(
  resolveReferenceCitedInFiles(
    { smith2026: ['paper.md', 'appendix.tex'], empty: 'not-array' },
    ' smith2026 ',
  ),
  ['paper.md', 'appendix.tex'],
)
assert.deepEqual(
  resolveReferenceCitedInFiles({ smith2026: ['paper.md'], empty: 'not-array' }, 'empty'),
  [],
)
assert.deepEqual(resolveReferenceCitedInFiles({ smith2026: ['paper.md'] }, ' '), [])

const collections = [
  { key: 'methods', label: 'Methods' },
  { key: 'ml', label: 'Machine Learning' },
]
assert.equal(
  referenceIsInCollection({ collections: [' Methods '] }, 'methods', collections),
  true,
)
assert.equal(
  referenceIsInCollection({ collections: ['machine learning'] }, 'ml', collections),
  true,
)
assert.equal(referenceIsInCollection({ collections: ['other'] }, 'methods', collections), false)
assert.equal(referenceIsInCollection({ collections: ['methods'] }, 'missing', collections), false)

assert.equal(normalizeReferenceFilenameSegment(' Smith: Paper? ', 'reference'), 'Smith- Paper')
assert.equal(normalizeReferenceFilenameSegment('   ', 'reference'), 'reference')
assert.equal(
  buildReferenceExportDefaultPath(
    { citationKey: ' Smith:2026 ', title: 'Ignored Title' },
    { extension: '.bib' },
  ),
  'Smith-2026.bib',
)
assert.equal(
  buildReferenceExportDefaultPath(
    { citationKey: '', title: ' A / B ' },
    { extension: 'json' },
  ),
  'A - B.json',
)

const contextMenuGroups = buildReferenceContextMenuGroups({
  reference: {
    id: 'ref-1',
    title: 'Reference Title',
    citationKey: 'ref2026',
    pdfPath: '/tmp/paper.pdf',
    collections: ['Methods'],
  },
  collections,
  translate: (key) => `t:${key}`,
})
assert.deepEqual(
  contextMenuGroups.map((group) => group.key),
  [
    'reference-maintenance',
    'reference-collections',
    'reference-exports',
    'reference-actions',
  ],
)
assert.deepEqual(
  contextMenuGroups[0].items.map((item) => [item.actionId, item.disabled]),
  [
    ['rename-pdf', false],
    ['refresh-metadata', undefined],
  ],
)
assert.equal(contextMenuGroups[1].items[0].label, 't:Collections')
assert.deepEqual(
  contextMenuGroups[1].items[0].children.map((item) => ({
    actionId: item.actionId,
    collectionKey: item.collectionKey,
    checked: item.checked,
  })),
  [
    { actionId: 'toggle-collection', collectionKey: 'methods', checked: true },
    { actionId: 'toggle-collection', collectionKey: 'ml', checked: false },
  ],
)
assert.equal(contextMenuGroups[2].items[0].actionId, 'export-bibtex')
assert.equal(contextMenuGroups[2].items[1].actionId, 'export-detailed')
assert.equal(contextMenuGroups[2].items[2].actionId, 'copy-bibtex')
assert.equal(contextMenuGroups[3].items[0].danger, true)

const emptyCollectionMenuGroups = buildReferenceContextMenuGroups({
  reference: { id: 'ref-2', pdfPath: '' },
  collections: [],
  translate: (key) => key,
})
assert.equal(emptyCollectionMenuGroups[0].items[0].disabled, true)
assert.deepEqual(emptyCollectionMenuGroups[1].items[0].children, [
  {
    key: 'collections-empty:ref-2',
    label: 'No collections yet',
    disabled: true,
    actionId: 'noop',
    referenceId: 'ref-2',
  },
])

const workbenchSource = await readFile('src/components/references/ReferenceLibraryWorkbench.vue', 'utf8')

assert.match(
  workbenchSource,
  /from '..\/..\/domains\/references\/referenceWorkbenchPresentation\.js'/,
  'ReferenceLibraryWorkbench must use the reference workbench presentation helper',
)
assert.match(
  workbenchSource,
  /resolveNextReferenceSortKey/,
  'ReferenceLibraryWorkbench must delegate sort toggles to the reference domain',
)
assert.match(
  workbenchSource,
  /buildReferenceDetailResizePayload/,
  'ReferenceLibraryWorkbench must delegate resize payload constraints to the reference domain',
)
assert.match(
  workbenchSource,
  /buildReferenceExportDefaultPath/,
  'ReferenceLibraryWorkbench must delegate export filename fallback to the reference domain',
)
assert.match(
  workbenchSource,
  /buildReferenceContextMenuGroups/,
  'ReferenceLibraryWorkbench must delegate context-menu presentation to the reference domain',
)
assert.doesNotMatch(
  workbenchSource,
  /const REFERENCE_DETAIL_MIN_WIDTH|const REFERENCE_LIST_MIN_WIDTH|const REFERENCE_DETAIL_MAX_CONTAINER_RATIO/,
  'ReferenceLibraryWorkbench must not duplicate detail dock layout constants inline',
)
assert.doesNotMatch(
  workbenchSource,
  /function normalizeFilenameSegment|function referenceIsInCollection/,
  'ReferenceLibraryWorkbench must not own deterministic filename or collection-membership helpers',
)
assert.doesNotMatch(
  workbenchSource,
  /key: 'reference-maintenance'|key: 'reference-collections'|key: 'reference-exports'|key: 'reference-actions'/,
  'ReferenceLibraryWorkbench must not own reference context-menu group construction inline',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    detailResizeConstraintsDerived: true,
    sortTogglesDerived: true,
    referencePathAndCitationStateDerived: true,
    collectionMembershipDerived: true,
    contextMenuGroupsDerived: true,
    exportFilenameFallbackDerived: true,
    componentUsesDomainHelper: true,
  },
}, null, 2))
