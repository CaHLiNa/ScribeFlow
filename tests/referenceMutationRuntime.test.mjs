import test from 'node:test'
import assert from 'node:assert/strict'

import { createReferenceMutationRuntime } from '../src/domains/reference/referenceMutationRuntime.js'

function createHarness() {
  const state = {
    globalLibrary: [
      { _key: 'alpha', title: 'Alpha', _collections: ['c1'], _tags: ['old'] },
      { _key: 'beta', title: 'Beta' },
    ],
    globalKeyMap: { alpha: 0, beta: 1 },
    collections: [{ id: 'c1', name: 'Core' }],
    savedViews: [{ id: 'view-1', name: 'Core only', collectionId: 'c1' }],
  }
  const globalCommits = []
  const workbenchCommits = []

  const runtime = createReferenceMutationRuntime({
    getGlobalLibrary: () => state.globalLibrary,
    getGlobalKeyMap: () => state.globalKeyMap,
    getCollections: () => state.collections,
    setCollections: (value) => {
      state.collections = value
    },
    getSavedViews: () => state.savedViews,
    setSavedViews: (value) => {
      state.savedViews = value
    },
    commitGlobalReferenceMutations: (changed) => {
      if (changed) globalCommits.push(true)
      return changed ? 1 : 0
    },
    commitWorkbenchMutations: (changed) => {
      if (changed) workbenchCommits.push(true)
      return changed ? 1 : 0
    },
    createReferenceWorkbenchCollection: (collections, nameRaw) => {
      const name = String(nameRaw || '').trim()
      if (!name) return { ok: false }
      const existing = collections.find((entry) => entry.name === name)
      if (existing) return { ok: true, duplicated: true, collection: existing }
      const collection = { id: `generated-${collections.length + 1}`, name }
      return { ok: true, duplicated: false, collection, collections: [...collections, collection] }
    },
    deleteReferenceWorkbenchCollection: ({ collections, globalLibrary, savedViews, collectionId }) => {
      if (!collections.some((entry) => entry.id === collectionId)) return { ok: false }
      let changedGlobalLibrary = false
      for (const ref of globalLibrary) {
        if (Array.isArray(ref._collections) && ref._collections.includes(collectionId)) {
          ref._collections = ref._collections.filter((id) => id !== collectionId)
          if (ref._collections.length === 0) delete ref._collections
          changedGlobalLibrary = true
        }
      }
      return {
        ok: true,
        collections: collections.filter((entry) => entry.id !== collectionId),
        savedViews: savedViews.filter((entry) => entry.collectionId !== collectionId),
        changedGlobalLibrary,
      }
    },
    createReferenceSavedView: (savedViews, { name, filters }) => {
      const trimmed = String(name || '').trim()
      if (!trimmed) return { ok: false }
      const existing = savedViews.find((entry) => entry.name === trimmed)
      if (existing) return { ok: true, duplicated: true, savedView: existing }
      const savedView = { id: `saved-${savedViews.length + 1}`, name: trimmed, filters }
      return { ok: true, duplicated: false, savedView, savedViews: [...savedViews, savedView] }
    },
    deleteReferenceSavedView: (savedViews, savedViewId) => {
      if (!savedViews.some((entry) => entry.id === savedViewId)) return { ok: false }
      return {
        ok: true,
        savedViews: savedViews.filter((entry) => entry.id !== savedViewId),
      }
    },
    addReferenceCollection: (ref, id) => {
      const next = new Set(ref._collections || [])
      const sizeBefore = next.size
      next.add(id)
      if (next.size === sizeBefore) return false
      ref._collections = [...next]
      return true
    },
    removeReferenceCollection: (ref, id) => {
      if (!Array.isArray(ref._collections) || !ref._collections.includes(id)) return false
      ref._collections = ref._collections.filter((entry) => entry !== id)
      if (ref._collections.length === 0) delete ref._collections
      return true
    },
    toggleReferenceCollection: (ref, id) => {
      if (Array.isArray(ref._collections) && ref._collections.includes(id)) {
        ref._collections = ref._collections.filter((entry) => entry !== id)
        if (ref._collections.length === 0) delete ref._collections
        return true
      }
      ref._collections = [...(ref._collections || []), id]
      return true
    },
    updateReferenceWorkflowField: (ref, field, value) => {
      if (ref[field] === value) return false
      ref[field] = value
      return true
    },
    addReferenceTags: (ref, tags) => {
      const next = new Set(ref._tags || [])
      const sizeBefore = next.size
      for (const tag of tags || []) next.add(tag)
      if (next.size === sizeBefore) return false
      ref._tags = [...next]
      return true
    },
    replaceReferenceTags: (ref, tags) => {
      const next = [...new Set((tags || []).filter(Boolean))]
      if (JSON.stringify(ref._tags || []) === JSON.stringify(next)) return false
      ref._tags = next
      return true
    },
    removeReferenceTags: (ref, tags) => {
      if (!Array.isArray(ref._tags)) return false
      const removeSet = new Set(tags || [])
      const next = ref._tags.filter((tag) => !removeSet.has(tag))
      if (next.length === ref._tags.length) return false
      ref._tags = next
      return true
    },
  })

  return {
    runtime,
    state,
    globalCommits,
    workbenchCommits,
  }
}

test('reference mutation runtime persists collection and saved-view workbench edits', () => {
  const harness = createHarness()

  const collection = harness.runtime.createCollection('New Collection')
  const duplicate = harness.runtime.createCollection('New Collection')
  const savedView = harness.runtime.createSavedView({ name: 'Unread', filters: { state: 'todo' } })
  const deletedSavedView = harness.runtime.deleteSavedView('view-1')

  assert.equal(collection.ok, true)
  assert.equal(collection.duplicated, false)
  assert.equal(duplicate.duplicated, true)
  assert.equal(savedView.ok, true)
  assert.equal(deletedSavedView, true)
  assert.equal(harness.workbenchCommits.length, 3)
})

test('reference mutation runtime deletes collections and routes through global commits when refs change', () => {
  const harness = createHarness()

  const removed = harness.runtime.deleteCollection('c1')

  assert.equal(removed, true)
  assert.deepEqual(harness.state.collections, [])
  assert.deepEqual(harness.state.savedViews, [])
  assert.equal(harness.state.globalLibrary[0]._collections, undefined)
  assert.equal(harness.globalCommits.length, 1)
  assert.equal(harness.workbenchCommits.length, 0)
})

test('reference mutation runtime applies workflow, collection, and tag mutations through global commits', () => {
  const harness = createHarness()

  assert.equal(harness.runtime.addCollectionToReferences(['beta'], 'c1'), 1)
  assert.equal(harness.runtime.toggleCollectionForReference('alpha', 'c1'), true)
  assert.equal(harness.runtime.setReadingState(['alpha'], 'reading'), 1)
  assert.equal(harness.runtime.setPriority(['alpha'], 'high'), 1)
  assert.equal(harness.runtime.setRating(['alpha'], 5), 1)
  assert.equal(harness.runtime.saveReferenceSummary('alpha', 'Summary'), true)
  assert.equal(harness.runtime.saveReferenceReadingNote('alpha', 'Note'), true)
  assert.equal(harness.runtime.addTagsToReferences(['alpha'], ['new']), 1)
  assert.equal(harness.runtime.replaceTagsForReferences(['alpha'], ['fresh']), 1)
  assert.equal(harness.runtime.removeTagsFromReferences(['alpha'], ['fresh']), 1)

  assert.deepEqual(harness.state.globalLibrary[1]._collections, ['c1'])
  assert.equal(harness.state.globalLibrary[0]._readingState, 'reading')
  assert.equal(harness.state.globalLibrary[0]._priority, 'high')
  assert.equal(harness.state.globalLibrary[0]._rating, 5)
  assert.equal(harness.state.globalLibrary[0]._summary, 'Summary')
  assert.equal(harness.state.globalLibrary[0]._readingNote, 'Note')
  assert.deepEqual(harness.state.globalLibrary[0]._tags, [])
  assert.equal(harness.globalCommits.length, 10)
})
