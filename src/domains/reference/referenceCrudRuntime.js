export function createReferenceCrudRuntime({
  getGlobalLibrary,
  getGlobalKeyMap,
  getWorkspaceKeys,
  setWorkspaceKeys,
  getByKey,
  syncWorkspaceView,
  saveLibrary,
  generateKey,
  auditImportCandidate,
  addKeyToWorkspace,
  prepareReferenceImport,
  buildMergedReference,
  trackReferenceImport,
  now = () => new Date().toISOString(),
} = {}) {
  function addReference(cslJson) {
    const nextRef = prepareReferenceImport(cslJson, {
      generateKey,
    })

    const duplicateAudit = auditImportCandidate(nextRef)
    if (duplicateAudit.existingKey) {
      addKeyToWorkspace(duplicateAudit.existingKey)
      return {
        key: duplicateAudit.existingKey,
        status: 'duplicate',
        existingKey: duplicateAudit.existingKey,
        matchType: duplicateAudit.matchType,
      }
    }

    if (!nextRef._addedAt) {
      nextRef._addedAt = now()
    }

    const globalLibrary = getGlobalLibrary?.() || []
    globalLibrary.push(nextRef)
    setWorkspaceKeys?.([...(getWorkspaceKeys?.() || []), nextRef._key])
    syncWorkspaceView?.()
    saveLibrary?.()
    trackReferenceImport?.(nextRef._importMethod || 'manual')

    return { key: nextRef._key, status: 'added' }
  }

  function addReferences(cslArray = []) {
    const report = { added: [], duplicates: [], errors: [] }
    for (const csl of cslArray) {
      try {
        const result = addReference({ ...csl })
        if (result.status === 'added') report.added.push(result.key)
        else report.duplicates.push(result.existingKey || result.key)
      } catch (error) {
        report.errors.push({ csl, error: error.message })
      }
    }
    return report
  }

  function updateReference(key, updates = {}) {
    const globalKeyMap = getGlobalKeyMap?.() || {}
    const idx = globalKeyMap[key]
    if (idx === undefined) return false

    const globalLibrary = getGlobalLibrary?.() || []
    Object.assign(globalLibrary[idx], updates)

    if (updates._key && updates._key !== key) {
      globalLibrary[idx].id = updates._key
      setWorkspaceKeys?.((getWorkspaceKeys?.() || []).map((item) => (item === key ? updates._key : item)))
    }

    syncWorkspaceView?.()
    saveLibrary?.()
    return true
  }

  function mergeReference(existingKey, importedRef, fieldSelections = {}) {
    const existingRef = getByKey?.(existingKey)
    if (!existingRef || !importedRef) return { status: 'missing' }

    const merged = buildMergedReference(existingRef, importedRef, fieldSelections)
    if (!merged) return { status: 'missing' }

    updateReference(existingKey, merged)
    return {
      status: 'merged',
      key: existingKey,
      ref: getByKey?.(existingKey) || null,
    }
  }

  return {
    addReference,
    addReferences,
    updateReference,
    mergeReference,
  }
}
