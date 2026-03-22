export function createReferenceMutationRuntime({
  getGlobalLibrary,
  getGlobalKeyMap,
  getCollections,
  setCollections,
  getSavedViews,
  setSavedViews,
  commitGlobalReferenceMutations,
  commitWorkbenchMutations,
  createReferenceWorkbenchCollection,
  deleteReferenceWorkbenchCollection,
  createReferenceSavedView,
  deleteReferenceSavedView,
  addReferenceCollection,
  removeReferenceCollection,
  toggleReferenceCollection,
  updateReferenceWorkflowField,
  addReferenceTags,
  replaceReferenceTags,
  removeReferenceTags,
} = {}) {
  function mutateKeys(keys = [], mutation) {
    const globalLibrary = getGlobalLibrary?.() || []
    const globalKeyMap = getGlobalKeyMap?.() || {}
    let changed = false

    for (const key of new Set((keys || []).filter(Boolean))) {
      const idx = globalKeyMap[key]
      if (idx === undefined) continue
      changed = mutation(globalLibrary[idx]) || changed
    }

    return changed
  }

  function createCollection(nameRaw = '') {
    const result = createReferenceWorkbenchCollection(getCollections?.() || [], nameRaw)
    if (!result.ok) return result
    if (result.duplicated) {
      return { ok: true, collection: result.collection, duplicated: true }
    }

    setCollections?.(result.collections)
    commitWorkbenchMutations?.(true)
    return { ok: true, collection: result.collection, duplicated: false }
  }

  function deleteCollection(collectionId = '') {
    const result = deleteReferenceWorkbenchCollection({
      collections: getCollections?.() || [],
      globalLibrary: getGlobalLibrary?.() || [],
      savedViews: getSavedViews?.() || [],
      collectionId,
    })
    if (!result.ok) return false

    setCollections?.(result.collections)
    setSavedViews?.(result.savedViews)
    if (result.changedGlobalLibrary) {
      commitGlobalReferenceMutations?.(true)
    } else {
      commitWorkbenchMutations?.(true)
    }
    return true
  }

  function addCollectionToReferences(keys = [], collectionId = '') {
    const id = String(collectionId || '').trim()
    if (!id || !(getCollections?.() || []).some((entry) => entry.id === id)) return 0
    const changed = mutateKeys(keys, (ref) => addReferenceCollection(ref, id))
    return commitGlobalReferenceMutations?.(changed) || 0
  }

  function removeCollectionFromReferences(keys = [], collectionId = '') {
    const id = String(collectionId || '').trim()
    if (!id) return 0
    const changed = mutateKeys(keys, (ref) => removeReferenceCollection(ref, id))
    return commitGlobalReferenceMutations?.(changed) || 0
  }

  function toggleCollectionForReference(key, collectionId = '') {
    const id = String(collectionId || '').trim()
    if (!id) return false
    const globalKeyMap = getGlobalKeyMap?.() || {}
    const idx = globalKeyMap[key]
    if (idx === undefined) return false

    const globalLibrary = getGlobalLibrary?.() || []
    const changed = toggleReferenceCollection(globalLibrary[idx], id)
    if (!changed) return false
    commitGlobalReferenceMutations?.(true)
    return true
  }

  function createSavedView({ name = '', filters = {} } = {}) {
    const result = createReferenceSavedView(getSavedViews?.() || [], { name, filters })
    if (!result.ok) return result
    if (result.duplicated) {
      return { ok: true, savedView: result.savedView, duplicated: true }
    }

    setSavedViews?.(result.savedViews)
    commitWorkbenchMutations?.(true)
    return { ok: true, savedView: result.savedView, duplicated: false }
  }

  function deleteSavedView(savedViewId = '') {
    const result = deleteReferenceSavedView(getSavedViews?.() || [], savedViewId)
    if (!result.ok) return false

    setSavedViews?.(result.savedViews)
    commitWorkbenchMutations?.(true)
    return true
  }

  function setReadingState(keys = [], state = '') {
    const changed = mutateKeys(keys, (ref) => updateReferenceWorkflowField(ref, '_readingState', state))
    return commitGlobalReferenceMutations?.(changed) || 0
  }

  function setPriority(keys = [], priority = '') {
    const changed = mutateKeys(keys, (ref) => updateReferenceWorkflowField(ref, '_priority', priority))
    return commitGlobalReferenceMutations?.(changed) || 0
  }

  function setRating(keys = [], rating = 0) {
    const changed = mutateKeys(keys, (ref) => updateReferenceWorkflowField(ref, '_rating', rating))
    return commitGlobalReferenceMutations?.(changed) || 0
  }

  function saveReferenceSummary(key, summary = '') {
    const globalKeyMap = getGlobalKeyMap?.() || {}
    const idx = globalKeyMap[key]
    if (idx === undefined) return false

    const globalLibrary = getGlobalLibrary?.() || []
    const changed = updateReferenceWorkflowField(globalLibrary[idx], '_summary', summary)
    return (commitGlobalReferenceMutations?.(changed) || 0) > 0
  }

  function saveReferenceReadingNote(key, note = '') {
    const globalKeyMap = getGlobalKeyMap?.() || {}
    const idx = globalKeyMap[key]
    if (idx === undefined) return false

    const globalLibrary = getGlobalLibrary?.() || []
    const changed = updateReferenceWorkflowField(globalLibrary[idx], '_readingNote', note)
    return (commitGlobalReferenceMutations?.(changed) || 0) > 0
  }

  function addTagsToReferences(keys = [], tags = []) {
    const changed = mutateKeys(keys, (ref) => addReferenceTags(ref, tags))
    return commitGlobalReferenceMutations?.(changed) || 0
  }

  function replaceTagsForReferences(keys = [], tags = []) {
    const changed = mutateKeys(keys, (ref) => replaceReferenceTags(ref, tags))
    return commitGlobalReferenceMutations?.(changed) || 0
  }

  function removeTagsFromReferences(keys = [], tags = []) {
    const changed = mutateKeys(keys, (ref) => removeReferenceTags(ref, tags))
    return commitGlobalReferenceMutations?.(changed) || 0
  }

  return {
    createCollection,
    deleteCollection,
    addCollectionToReferences,
    removeCollectionFromReferences,
    toggleCollectionForReference,
    createSavedView,
    deleteSavedView,
    setReadingState,
    setPriority,
    setRating,
    saveReferenceSummary,
    saveReferenceReadingNote,
    addTagsToReferences,
    replaceTagsForReferences,
    removeTagsFromReferences,
  }
}
