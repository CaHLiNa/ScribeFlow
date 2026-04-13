import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'

import { useReferencesStore } from '../src/stores/references.js'

test('references store exposes the expected library section counts', () => {
  setActivePinia(createPinia())
  const store = useReferencesStore()

  assert.equal(store.sectionCounts.all, 0)
  assert.equal(store.sectionCounts.unfiled, 0)
  assert.equal(store.sectionCounts['missing-identifier'], 0)
  assert.equal(store.sectionCounts['missing-pdf'], 0)
})

test('changing the selected section keeps the selected reference inside the filtered result', () => {
  setActivePinia(createPinia())
  const store = useReferencesStore()

  store.applyLibrarySnapshot({
    references: [
      {
        id: 'ref-1',
        typeKey: 'journal-article',
        title: 'A',
        authors: ['One'],
        authorLine: 'One',
        year: 2024,
        source: 'Journal',
        identifier: 'doi:a',
        pages: '',
        citationKey: 'a2024',
        hasPdf: true,
        collections: ['set-a'],
        tags: [],
        abstract: '',
        annotations: [],
      },
      {
        id: 'ref-2',
        typeKey: 'conference-paper',
        title: 'B',
        authors: ['Two'],
        authorLine: 'Two',
        year: 2025,
        source: 'Conf',
        identifier: '',
        pages: '',
        citationKey: 'b2025',
        hasPdf: true,
        collections: [],
        tags: [],
        abstract: '',
        annotations: [],
      },
      {
        id: 'ref-3',
        typeKey: 'journal-article',
        title: 'C',
        authors: ['Three'],
        authorLine: 'Three',
        year: 2026,
        source: 'Journal',
        identifier: 'doi:c',
        pages: '',
        citationKey: 'c2026',
        hasPdf: false,
        collections: ['set-c'],
        tags: [],
        abstract: '',
        annotations: [],
      },
    ],
  })

  store.selectReference('ref-1')
  store.setSelectedSection('missing-pdf')

  assert.equal(store.selectedReferenceId, 'ref-3')
  assert.equal(store.filteredReferences.length, 1)
  assert.equal(store.selectedReference?.id, 'ref-3')
})

test('applying a legacy snapshot normalizes reference type labels into type keys', () => {
  setActivePinia(createPinia())
  const store = useReferencesStore()

  store.applyLibrarySnapshot({
    references: [
      {
        id: 'legacy-1',
        typeLabel: '期刊论文',
        title: 'Legacy',
        authors: [],
        authorLine: '',
        year: 2024,
        source: '',
        identifier: '',
        pages: '',
        citationKey: '',
        hasPdf: false,
        collections: [],
        tags: [],
        abstract: '',
        annotations: [],
      },
    ],
  })

  assert.equal(store.references[0].typeKey, 'journal-article')
})
