import assert from 'node:assert/strict'

const {
  buildDocumentCitationCoverage,
  citationKeysForReference,
  referenceMatchesCitationKey,
} = await import('../src/domains/references/documentCitationCoverage.js')

const selectedReferences = [
  { id: 'ref-a', citationKey: 'alpha2024', title: 'Alpha' },
  { id: 'ref-b', citationKey: 'beta2025', title: 'Beta' },
  { id: 'ref-c', citationKey: '', title: 'Gamma' },
]

assert.deepEqual(citationKeysForReference(selectedReferences[0]), ['alpha2024', 'ref-a'])
assert.equal(referenceMatchesCitationKey(selectedReferences[1], 'beta2025'), true)
assert.equal(referenceMatchesCitationKey(selectedReferences[1], 'ref-b'), true)
assert.equal(referenceMatchesCitationKey(selectedReferences[1], 'missing'), false)

const coverage = buildDocumentCitationCoverage({
  citedKeys: ['alpha2024', 'ref-b', 'missing-key', 'alpha2024', '', null],
  selectedReferences,
})

assert.deepEqual(coverage.citedKeys, ['alpha2024', 'ref-b', 'missing-key'])
assert.deepEqual(coverage.linkedCitationKeys, ['alpha2024', 'ref-b'])
assert.deepEqual(coverage.missingCitationKeys, ['missing-key'])
assert.deepEqual(coverage.unusedReferences.map((reference) => reference.id), ['ref-c'])
assert.deepEqual(coverage.counts, {
  cited: 3,
  linked: 2,
  missing: 1,
  selected: 3,
  unused: 1,
})
assert.equal(coverage.allCitationsLinked, false)

const linkedCoverage = buildDocumentCitationCoverage({
  citedKeys: ['alpha2024', 'ref-b'],
  selectedReferences,
})

assert.deepEqual(linkedCoverage.missingCitationKeys, [])
assert.deepEqual(linkedCoverage.unusedReferences.map((reference) => reference.id), ['ref-c'])
assert.equal(linkedCoverage.allCitationsLinked, true)

console.log('document citation coverage contract probe passed')
