export function createReferenceMigrationRuntime({
  captureWorkspaceContext,
  readJsonArray,
  resolveLegacyWorkspaceReferenceLibraryPath,
  resolveLegacyWorkspaceReferencePdfsDir,
  resolveLegacyWorkspaceReferenceFulltextDir,
  resolveGlobalReferencePdfPath,
  resolveGlobalReferenceFulltextPath,
  buildReferenceKey,
  referenceKey,
  cloneReferenceValue,
  buildKeyMapFromList,
  copyFileIfPresent,
  pathExists,
  deletePath,
  warn = console.warn,
} = {}) {
  async function deleteReferenceAsset(path) {
    if (!path) return false
    try {
      const exists = await pathExists?.(path)
      if (!exists) return false
      await deletePath?.(path)
      return true
    } catch (error) {
      warn?.('Failed to delete reference asset:', path, error)
      return false
    }
  }

  async function migrateLegacyReferenceAssets(context = captureWorkspaceContext?.(), targetRef, legacyRef, key) {
    if (!context?.projectDir || !context?.globalConfigDir) return false

    let changed = false
    const legacyPdfsDir = resolveLegacyWorkspaceReferencePdfsDir(context.projectDir)
    const legacyFulltextDir = resolveLegacyWorkspaceReferenceFulltextDir(context.projectDir)

    if (legacyRef?._pdfFile && !targetRef?._pdfFile) {
      const copied = await copyFileIfPresent(
        `${legacyPdfsDir}/${legacyRef._pdfFile}`,
        resolveGlobalReferencePdfPath(context.globalConfigDir, `${key}.pdf`),
      )
      if (copied) {
        targetRef._pdfFile = `${key}.pdf`
        changed = true
      }
    }

    if (legacyRef?._textFile && !targetRef?._textFile) {
      const copied = await copyFileIfPresent(
        `${legacyFulltextDir}/${legacyRef._textFile}`,
        resolveGlobalReferenceFulltextPath(context.globalConfigDir, `${key}.txt`),
      )
      if (copied) {
        targetRef._textFile = `${key}.txt`
        changed = true
      }
    }

    return changed
  }

  async function migrateLegacyWorkspaceData(
    context = captureWorkspaceContext?.(),
    { globalLibrary = [], workspaceKeys = [] } = {},
  ) {
    const legacyLibraryPath = resolveLegacyWorkspaceReferenceLibraryPath(context.projectDir)
    const legacyRefs = await readJsonArray(legacyLibraryPath)
    if (legacyRefs.length === 0) {
      return {
        globalLibrary,
        workspaceKeys,
        didChange: false,
        legacyLibraryFound: false,
      }
    }

    const nextGlobalLibrary = [...globalLibrary]
    const nextWorkspaceKeys = [...workspaceKeys]
    const nextGlobalKeyMap = buildKeyMapFromList(nextGlobalLibrary)
    let didChange = false

    for (const legacyRef of legacyRefs) {
      const key = referenceKey(legacyRef) || buildReferenceKey(legacyRef, new Set(Object.keys(nextGlobalKeyMap)))
      let targetRef = nextGlobalKeyMap[key] !== undefined ? nextGlobalLibrary[nextGlobalKeyMap[key]] : null

      if (!targetRef) {
        const nextRef = {
          ...cloneReferenceValue(legacyRef),
          _key: key,
          id: key,
        }
        nextGlobalLibrary.push(nextRef)
        nextGlobalKeyMap[key] = nextGlobalLibrary.length - 1
        targetRef = nextRef
        didChange = true
      }

      if (!nextWorkspaceKeys.includes(key)) {
        nextWorkspaceKeys.push(key)
        didChange = true
      }

      const assetChanged = await migrateLegacyReferenceAssets(context, targetRef, legacyRef, key)
      if (assetChanged) didChange = true
    }

    return {
      globalLibrary: nextGlobalLibrary,
      workspaceKeys: nextWorkspaceKeys,
      didChange,
      legacyLibraryFound: true,
    }
  }

  return {
    deleteReferenceAsset,
    migrateLegacyReferenceAssets,
    migrateLegacyWorkspaceData,
  }
}
