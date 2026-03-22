export function createReferenceAssetRuntime({
  getGlobalLibrary,
  getGlobalKeyMap,
  getGlobalConfigDir,
  applyGlobalRemoval,
  deleteReferenceAsset,
  writeLibraries,
  updateReference,
  resolveGlobalReferencePdfPath,
  resolveGlobalReferenceFulltextPath,
  resolveGlobalReferencePdfsDir,
  resolveGlobalReferenceFulltextDir,
  invoke,
  extractTextFromPdf,
  warn = console.warn,
} = {}) {
  async function removeReferencesFromGlobal(keys = []) {
    const uniqueKeys = Array.from(new Set((keys || []).filter(Boolean)))
    if (uniqueKeys.length === 0) return []

    const globalConfigDir = getGlobalConfigDir?.()
    const globalKeyMap = getGlobalKeyMap?.() || {}
    const globalLibrary = getGlobalLibrary?.() || []
    const removeSet = new Set()
    const assetPaths = []

    for (const key of uniqueKeys) {
      const idx = globalKeyMap[key]
      if (idx === undefined) continue
      const ref = globalLibrary[idx]
      removeSet.add(key)
      if (globalConfigDir && ref?._pdfFile) {
        assetPaths.push(resolveGlobalReferencePdfPath(globalConfigDir, ref._pdfFile))
      }
      if (globalConfigDir && ref?._textFile) {
        assetPaths.push(resolveGlobalReferenceFulltextPath(globalConfigDir, ref._textFile))
      }
    }

    if (removeSet.size === 0) return []

    const removedKeys = applyGlobalRemoval?.([...removeSet]) || [...removeSet]

    for (const path of assetPaths) {
      await deleteReferenceAsset?.(path)
    }

    await writeLibraries?.()
    return removedKeys
  }

  async function storePdf(key, sourcePath) {
    const globalConfigDir = getGlobalConfigDir?.()
    if (!globalConfigDir) return

    const pdfsDir = resolveGlobalReferencePdfsDir(globalConfigDir)
    const textDir = resolveGlobalReferenceFulltextDir(globalConfigDir)
    const destPdf = resolveGlobalReferencePdfPath(globalConfigDir, `${key}.pdf`)

    try {
      await invoke?.('create_dir', { path: pdfsDir }).catch(() => {})
      await invoke?.('copy_file', { src: sourcePath, dest: destPdf })
      updateReference?.(key, { _pdfFile: `${key}.pdf` })
    } catch (error) {
      warn?.('Failed to store PDF:', error)
    }

    try {
      const text = await extractTextFromPdf?.(destPdf)
      if (text) {
        await invoke?.('create_dir', { path: textDir }).catch(() => {})
        await invoke?.('write_file', {
          path: resolveGlobalReferenceFulltextPath(globalConfigDir, `${key}.txt`),
          content: text,
        })
        updateReference?.(key, { _textFile: `${key}.txt` })
      }
    } catch (error) {
      warn?.('Failed to extract PDF text:', error)
    }
  }

  return {
    removeReferencesFromGlobal,
    storePdf,
  }
}
