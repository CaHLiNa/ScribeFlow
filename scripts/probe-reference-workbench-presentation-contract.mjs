import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  REFERENCE_WORKBENCH_DETAIL_CLOSE_RESET_DELAY_MS,
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

console.log(JSON.stringify({
  ok: true,
  summary: {
    detailResizeConstraintsDerived: true,
    sortTogglesDerived: true,
    referencePathAndCitationStateDerived: true,
    collectionMembershipDerived: true,
    exportFilenameFallbackDerived: true,
    componentUsesDomainHelper: true,
  },
}, null, 2))
