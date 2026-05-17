import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  REFERENCE_DETAIL_EDITABLE_FIELDS,
  buildReferenceDetailDirtyUpdates,
  buildReferenceDetailDraftSnapshot,
  buildReferenceDetailHeroMetaItems,
  buildReferenceDetailPdfExtensionTarget,
  hasReferenceDetailDraftFieldChanged,
  normalizeReferenceDetailAuthors,
  normalizeReferenceDetailCollectionMemberships,
  normalizeReferenceDetailTagValues,
  normalizeReferenceDetailText,
  resolveReferenceDetailCollection,
  resolveReferenceDetailCollectionLabel,
  resolveReferenceDetailPdfPath,
} from '../src/domains/references/referenceDetailDraft.js'

assert.deepEqual(REFERENCE_DETAIL_EDITABLE_FIELDS, [
  'title',
  'authorsText',
  'citationKey',
  'year',
  'source',
  'identifier',
  'volume',
  'issue',
  'pages',
  'abstract',
  'note',
])

assert.equal(normalizeReferenceDetailText('  demo  '), 'demo')
assert.deepEqual(normalizeReferenceDetailAuthors(' Ada ; Grace\n\n Linus '), [
  'Ada',
  'Grace',
  'Linus',
])
assert.deepEqual(normalizeReferenceDetailTagValues(' #ml, pdf\nscience; '), [
  'ml',
  'pdf',
  'science',
])

const collections = [
  { key: 'methods', label: 'Methods' },
  { key: 'ml', label: 'Machine Learning' },
]

assert.deepEqual(resolveReferenceDetailCollection(collections, ' methods '), collections[0])
assert.deepEqual(resolveReferenceDetailCollection(collections, 'machine learning'), collections[1])
assert.equal(resolveReferenceDetailCollectionLabel(collections, 'ml'), 'Machine Learning')
assert.deepEqual(
  normalizeReferenceDetailCollectionMemberships(collections, ['Methods', 'custom']),
  ['methods', 'custom'],
)

const reference = {
  id: 'ref-1',
  title: 'Original Title',
  authors: ['Ada Lovelace', 'Grace Hopper'],
  citationKey: 'ada2026',
  year: 2026,
  source: 'Journal',
  identifier: '10.1000/demo',
  volume: '12',
  issue: '2',
  pages: '1-12',
  abstract: 'Abstract',
  notes: ['Note A', 'Note B'],
  collections: ['Methods'],
  tags: ['math'],
  pdfPath: ' /tmp/paper.pdf ',
}

assert.deepEqual(buildReferenceDetailDraftSnapshot(reference, collections), {
  title: 'Original Title',
  authorsText: 'Ada Lovelace; Grace Hopper',
  citationKey: 'ada2026',
  year: '2026',
  source: 'Journal',
  identifier: '10.1000/demo',
  volume: '12',
  issue: '2',
  pages: '1-12',
  abstract: 'Abstract',
  note: 'Note A\n\nNote B',
  collections: ['methods'],
  tags: ['math'],
})
assert.equal(resolveReferenceDetailPdfPath(reference), '/tmp/paper.pdf')
assert.deepEqual(buildReferenceDetailPdfExtensionTarget(reference), {
  kind: 'referencePdf',
  referenceId: 'ref-1',
  path: '/tmp/paper.pdf',
})
assert.deepEqual(
  buildReferenceDetailHeroMetaItems({
    year: '2026',
    source: 'Journal',
    citationKey: 'ada2026',
  }),
  ['2026', 'Journal', 'ada2026'],
)

assert.equal(
  hasReferenceDetailDraftFieldChanged({
    field: 'authorsText',
    draft: { authorsText: 'Ada Lovelace; Grace Hopper' },
    reference,
    collections,
  }),
  false,
)
assert.equal(
  hasReferenceDetailDraftFieldChanged({
    field: 'year',
    draft: { year: '2027' },
    reference,
    collections,
  }),
  true,
)

const draft = {
  title: ' Updated Title ',
  authorsText: 'Ada; Grace',
  citationKey: ' ada2027 ',
  year: ' 2027 ',
  source: ' Journal Updated ',
  identifier: ' doi ',
  volume: ' 13 ',
  issue: ' 3 ',
  pages: ' 12-24 ',
  abstract: ' Abstract updated ',
  note: ' Note updated ',
  collections: ['methods'],
  tags: ['math'],
}
const result = buildReferenceDetailDirtyUpdates({
  draft,
  tagInput: '#ml, math, physics',
  fields: new Set([
    'title',
    'authorsText',
    'citationKey',
    'year',
    'source',
    'identifier',
    'volume',
    'issue',
    'pages',
    'abstract',
    'note',
    'tagInput',
  ]),
})

assert.deepEqual(result.updates, {
  title: 'Updated Title',
  authors: ['Ada', 'Grace'],
  authorLine: 'Ada; Grace',
  citationKey: 'ada2027',
  year: 2027,
  source: 'Journal Updated',
  identifier: 'doi',
  volume: '13',
  issue: '3',
  pages: '12-24',
  abstract: 'Abstract updated',
  notes: ['Note updated'],
  tags: ['math', 'ml', 'physics'],
})
assert.equal(result.clearTagInput, true)
assert.equal(draft.title, ' Updated Title ', 'domain helper must not mutate caller draft')
assert.equal(result.draft.title, 'Updated Title')
assert.deepEqual(result.draft.tags, ['math', 'ml', 'physics'])

const panelSource = await readFile('src/components/panel/ReferenceDetailPanel.vue', 'utf8')

assert.match(
  panelSource,
  /from '..\/..\/domains\/references\/referenceDetailDraft\.js'/,
  'ReferenceDetailPanel must import draft rules from the reference detail domain',
)
assert.match(
  panelSource,
  /buildReferenceDetailDraftSnapshot/,
  'ReferenceDetailPanel must delegate draft snapshot creation to the reference domain',
)
assert.match(
  panelSource,
  /buildReferenceDetailDirtyUpdates/,
  'ReferenceDetailPanel must delegate dirty update derivation to the reference domain',
)
assert.doesNotMatch(
  panelSource,
  /function normalizeText|function normalizeAuthors|function normalizeTagValues|function normalizeDraftFieldForCompare/,
  'ReferenceDetailPanel must not duplicate deterministic draft normalization helpers',
)
assert.doesNotMatch(
  panelSource,
  /const editableDraftFields = \[/,
  'ReferenceDetailPanel must not duplicate the editable draft field list inline',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    draftSnapshotDerived: true,
    dirtyUpdatesDerived: true,
    collectionPresentationDerived: true,
    pdfTargetDerived: true,
    componentUsesDomainHelper: true,
  },
}, null, 2))
