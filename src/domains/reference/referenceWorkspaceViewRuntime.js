export function createReferenceWorkspaceViewRuntime({
  getGlobalLibrary,
  setGlobalLibrary,
  setGlobalKeyMap,
  getWorkspaceKeys,
  setWorkspaceKeys,
  setLibrary,
  setKeyMap,
  getActiveKey,
  setActiveKey,
  setLibraryDetailMode,
  getSelectedKeys,
  setSelectedKeys,
  buildKeyMapFromList,
  buildWorkspaceLibrary,
  referenceKey,
  saveLibrary,
} = {}) {
  function syncWorkspaceView() {
    const globalLibrary = getGlobalLibrary?.() || []
    const workspaceKeys = getWorkspaceKeys?.() || []
    const globalKeyMap = buildKeyMapFromList(globalLibrary)
    const workspaceView = buildWorkspaceLibrary(globalLibrary, globalKeyMap, workspaceKeys)

    setGlobalKeyMap?.(globalKeyMap)
    setLibrary?.(workspaceView.library)
    setWorkspaceKeys?.(workspaceView.keys)
    setKeyMap?.(buildKeyMapFromList(workspaceView.library))

    const activeKey = getActiveKey?.()
    if (activeKey && globalKeyMap[activeKey] === undefined) {
      setActiveKey?.(null)
      setLibraryDetailMode?.('browse')
    }

    return workspaceView
  }

  function commitGlobalReferenceMutations(changed = false) {
    if (!changed) return 0
    syncWorkspaceView()
    saveLibrary?.()
    return 1
  }

  function commitWorkbenchMutations(changed = false) {
    if (!changed) return 0
    saveLibrary?.()
    return 1
  }

  function applyRenamedReferenceKey(oldKey, nextKey) {
    if (!oldKey || !nextKey || oldKey === nextKey) return false

    const globalLibrary = getGlobalLibrary?.() || []
    const globalKeyMap = buildKeyMapFromList(globalLibrary)
    const idx = globalKeyMap[oldKey]
    if (idx === undefined) return false

    globalLibrary[idx]._key = nextKey
    globalLibrary[idx].id = nextKey

    const workspaceKeys = getWorkspaceKeys?.() || []
    setWorkspaceKeys?.(workspaceKeys.map((item) => (item === oldKey ? nextKey : item)))

    if (getActiveKey?.() === oldKey) {
      setActiveKey?.(nextKey)
    }

    const selectedKeys = getSelectedKeys?.()
    if (selectedKeys?.has(oldKey)) {
      const nextSelected = new Set(selectedKeys)
      nextSelected.delete(oldKey)
      nextSelected.add(nextKey)
      setSelectedKeys?.(nextSelected)
    }

    syncWorkspaceView()
    saveLibrary?.()
    return true
  }

  function addKeyToWorkspace(key) {
    const normalizedKey = String(key || '').trim()
    if (!normalizedKey) return false

    const workspaceKeys = getWorkspaceKeys?.() || []
    if (workspaceKeys.includes(normalizedKey)) return false

    setWorkspaceKeys?.([...workspaceKeys, normalizedKey])
    syncWorkspaceView()
    saveLibrary?.()
    return true
  }

  function removeReference(key) {
    const workspaceKeys = getWorkspaceKeys?.() || []
    if (!workspaceKeys.includes(key)) return false

    setWorkspaceKeys?.(workspaceKeys.filter((item) => item !== key))
    syncWorkspaceView()

    if (getActiveKey?.() === key) {
      setActiveKey?.(null)
      setLibraryDetailMode?.('browse')
    }

    const selectedKeys = getSelectedKeys?.()
    if (selectedKeys?.has(key)) {
      const nextSelected = new Set(selectedKeys)
      nextSelected.delete(key)
      setSelectedKeys?.(nextSelected)
    }

    saveLibrary?.()
    return true
  }

  function applyGlobalRemoval(keys = []) {
    const removeSet = new Set((keys || []).filter(Boolean))
    if (removeSet.size === 0) return []

    const globalLibrary = getGlobalLibrary?.() || []
    setGlobalLibrary?.(globalLibrary.filter((ref) => !removeSet.has(referenceKey?.(ref))))

    const workspaceKeys = getWorkspaceKeys?.() || []
    setWorkspaceKeys?.(workspaceKeys.filter((key) => !removeSet.has(key)))

    const activeKey = getActiveKey?.()
    if (activeKey && removeSet.has(activeKey)) {
      setActiveKey?.(null)
      setLibraryDetailMode?.('browse')
    }

    const selectedKeys = getSelectedKeys?.()
    if (selectedKeys?.size) {
      const nextSelected = new Set(selectedKeys)
      for (const key of removeSet) {
        nextSelected.delete(key)
      }
      setSelectedKeys?.(nextSelected)
    }

    syncWorkspaceView()
    return [...removeSet]
  }

  return {
    syncWorkspaceView,
    commitGlobalReferenceMutations,
    commitWorkbenchMutations,
    applyRenamedReferenceKey,
    addKeyToWorkspace,
    removeReference,
    applyGlobalRemoval,
  }
}
