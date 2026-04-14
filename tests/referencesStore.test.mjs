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
  assert.equal(store.sourceCounts.zotero, 0)
  assert.equal(store.sourceCounts.manual, 0)
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

test('selecting a source filters references and keeps selection inside that source', () => {
  setActivePinia(createPinia())
  const store = useReferencesStore()

  store.applyLibrarySnapshot({
    references: [
      {
        id: 'ref-1',
        typeKey: 'journal-article',
        title: 'Synced Paper',
        authors: ['One'],
        authorLine: 'One',
        year: 2024,
        source: 'Journal',
        identifier: 'doi:a',
        pages: '',
        citationKey: 'a2024',
        hasPdf: true,
        collections: [],
        tags: [],
        abstract: '',
        annotations: [],
        _source: 'zotero',
      },
      {
        id: 'ref-2',
        typeKey: 'conference-paper',
        title: 'Manual Paper',
        authors: ['Two'],
        authorLine: 'Two',
        year: 2025,
        source: 'Conf',
        identifier: 'doi:b',
        pages: '',
        citationKey: 'b2025',
        hasPdf: true,
        collections: [],
        tags: [],
        abstract: '',
        annotations: [],
      },
    ],
  })

  store.selectReference('ref-2')
  store.setSelectedSource('zotero')

  assert.equal(store.selectedSectionKey, 'all')
  assert.equal(store.selectedCollectionKey, '')
  assert.equal(store.selectedSourceKey, 'zotero')
  assert.equal(store.sourceCounts.zotero, 1)
  assert.equal(store.sourceCounts.manual, 1)
  assert.deepEqual(
    store.filteredReferences.map((reference) => reference.id),
    ['ref-1']
  )
  assert.equal(store.selectedReferenceId, 'ref-1')
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

test('references store filters by search query and keeps sorting stable', () => {
  setActivePinia(createPinia())
  const store = useReferencesStore()

  store.applyLibrarySnapshot({
    references: [
      {
        id: 'ref-a',
        typeKey: 'journal-article',
        title: 'Barrier Functions for Safety',
        authors: ['Alice'],
        authorLine: 'Alice',
        year: 2022,
        source: 'Automatica',
        identifier: 'doi:a',
        pages: '',
        citationKey: 'alice2022',
        hasPdf: false,
        collections: [],
        tags: [],
        abstract: '',
        annotations: [],
      },
      {
        id: 'ref-b',
        typeKey: 'conference-paper',
        title: 'Adaptive Cruise Control',
        authors: ['Bob'],
        authorLine: 'Bob',
        year: 2024,
        source: 'CDC',
        identifier: 'doi:b',
        pages: '',
        citationKey: 'bob2024',
        hasPdf: false,
        collections: [],
        tags: [],
        abstract: '',
        annotations: [],
      },
      {
        id: 'ref-c',
        typeKey: 'journal-article',
        title: 'Cruise Barrier Design',
        authors: ['Carol'],
        authorLine: 'Carol',
        year: 2021,
        source: 'TAC',
        identifier: 'doi:c',
        pages: '',
        citationKey: 'carol2021',
        hasPdf: false,
        collections: [],
        tags: [],
        abstract: '',
        annotations: [],
      },
    ],
  })

  store.setSearchQuery('cruise')
  assert.deepEqual(
    store.filteredReferences.map((reference) => reference.id),
    ['ref-b', 'ref-c']
  )

  store.setSortKey('title-asc')
  assert.deepEqual(
    store.filteredReferences.map((reference) => reference.id),
    ['ref-b', 'ref-c']
  )

  store.setSortKey('year-asc')
  assert.deepEqual(
    store.filteredReferences.map((reference) => reference.id),
    ['ref-c', 'ref-b']
  )

  store.setSortKey('author-desc')
  assert.deepEqual(
    store.filteredReferences.map((reference) => reference.id),
    ['ref-c', 'ref-b']
  )
})

test('creating a collection appends a unique library collection entry', async () => {
  setActivePinia(createPinia())
  const store = useReferencesStore()

  const created = await store.createCollection('', '控制理论')
  const duplicate = await store.createCollection('', '控制理论')

  assert.equal(created?.label, '控制理论')
  assert.equal(store.collections.length, 1)
  assert.equal(duplicate?.key, created?.key)
})

test('references store exports BibTeX from current records', () => {
  setActivePinia(createPinia())
  const store = useReferencesStore()

  store.applyLibrarySnapshot({
    references: [
      {
        id: 'ref-1',
        typeKey: 'journal-article',
        title: 'Control Barrier Functions',
        authors: ['Aaron D. Ames'],
        authorLine: 'Aaron D. Ames',
        year: 2014,
        source: 'IEEE Transactions on Automatic Control',
        identifier: '10.1109/TAC.2014.1234567',
        pages: '123-130',
        citationKey: 'ames2014',
        hasPdf: false,
        collections: [],
        tags: [],
        abstract: '',
        annotations: [],
      },
    ],
  })

  const bibtex = store.exportBibTeX()
  assert.match(bibtex, /@article\{ames2014,/)
  assert.match(bibtex, /doi = \{10\.1109\/TAC\.2014\.1234567\}/)
})

test('references store tracks citation style from the saved snapshot', () => {
  setActivePinia(createPinia())
  const store = useReferencesStore()

  store.applyLibrarySnapshot({
    citationStyle: 'ieee',
    references: [],
  })

  assert.equal(store.citationStyle, 'ieee')
  store.setCitationStyle('vancouver')
  assert.equal(store.citationStyle, 'vancouver')
  store.setCitationStyle('unknown-style')
  assert.equal(store.citationStyle, 'apa')
})

test('references store builds cited-in index from markdown and latex file contents', () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useReferencesStore()

  store.applyLibrarySnapshot({
    references: [
      {
        id: 'ref-1',
        typeKey: 'journal-article',
        title: 'Control Barrier Functions',
        authors: ['Aaron D. Ames'],
        authorLine: 'Aaron D. Ames',
        year: 2014,
        source: 'TAC',
        identifier: '10.1109/TAC.2014.1234567',
        pages: '',
        citationKey: 'ames2014',
        hasPdf: false,
        collections: [],
        tags: [],
        abstract: '',
        annotations: [],
      },
    ],
  })

  pinia.state.value.files = {
    fileContents: {
      '/tmp/a.md': 'See [@ames2014] for the original result.',
      '/tmp/b.tex': '\\cite{ames2014}',
      '/tmp/c.md': 'No citations here.',
    },
  }

  assert.deepEqual(store.citedIn.ames2014, ['/tmp/a.md', '/tmp/b.tex'])
  assert.equal(store.citedKeys.has('ames2014'), true)
})

test('references store imports RIS content through the generic import entry point', async () => {
  setActivePinia(createPinia())
  const store = useReferencesStore()

  const importedCount = await store.importReferenceText(
    '',
    `
TY  - JOUR
TI  - Safe Control
AU  - Ames, Aaron D.
JO  - TAC
PY  - 2014
DO  - 10.1109/TAC.2014.1234567
ER  -
`,
    'auto'
  )

  assert.equal(importedCount, 1)
  assert.equal(store.references.length, 1)
  assert.equal(store.references[0].title, 'Safe Control')
  assert.equal(store.references[0].identifier, '10.1109/TAC.2014.1234567')
})

test('selecting a collection filters references and keeps selection inside that collection', () => {
  setActivePinia(createPinia())
  const store = useReferencesStore()

  store.applyLibrarySnapshot({
    collections: [
      { key: 'control-theory', label: '控制理论' },
      { key: 'safety-design', label: '安全设计' },
    ],
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
        collections: ['control-theory'],
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
        identifier: 'doi:b',
        pages: '',
        citationKey: 'b2025',
        hasPdf: true,
        collections: ['safety-design'],
        tags: [],
        abstract: '',
        annotations: [],
      },
    ],
  })

  store.selectReference('ref-2')
  store.setSelectedCollection('control-theory')

  assert.equal(store.selectedSectionKey, 'all')
  assert.equal(store.selectedCollectionKey, 'control-theory')
  assert.deepEqual(
    store.filteredReferences.map((reference) => reference.id),
    ['ref-1']
  )
  assert.equal(store.selectedReferenceId, 'ref-1')
})

test('toggling a reference collection membership adds and removes the collection key', async () => {
  setActivePinia(createPinia())
  const store = useReferencesStore()

  store.applyLibrarySnapshot({
    collections: [{ key: 'control-theory', label: '控制理论' }],
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
        collections: [],
        tags: [],
        abstract: '',
        annotations: [],
      },
    ],
  })

  const added = await store.toggleReferenceCollection('', 'ref-1', 'control-theory')
  const removed = await store.toggleReferenceCollection('', 'ref-1', 'control-theory')

  assert.equal(added, true)
  assert.deepEqual(store.references[0].collections, [])
  assert.equal(removed, false)
})

test('renaming a collection updates its label and keeps memberships normalized to the collection key', async () => {
  setActivePinia(createPinia())
  const store = useReferencesStore()

  store.applyLibrarySnapshot({
    collections: [{ key: 'control-theory', label: '控制理论' }],
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
        collections: ['控制理论'],
        tags: [],
        abstract: '',
        annotations: [],
      },
    ],
  })

  const renamed = await store.renameCollection('', 'control-theory', '安全控制')

  assert.equal(renamed?.label, '安全控制')
  assert.deepEqual(store.references[0].collections, ['control-theory'])
  assert.equal(store.collectionCounts['control-theory'], 1)
})

test('removing a collection clears memberships and resets the selected collection filter', async () => {
  setActivePinia(createPinia())
  const store = useReferencesStore()

  store.applyLibrarySnapshot({
    collections: [{ key: 'control-theory', label: '控制理论' }],
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
        collections: ['control-theory'],
        tags: [],
        abstract: '',
        annotations: [],
      },
    ],
  })

  store.setSelectedCollection('control-theory')
  const removed = await store.removeCollection('', 'control-theory')

  assert.equal(removed, true)
  assert.equal(store.collections.length, 0)
  assert.deepEqual(store.references[0].collections, [])
  assert.equal(store.selectedCollectionKey, '')
})
