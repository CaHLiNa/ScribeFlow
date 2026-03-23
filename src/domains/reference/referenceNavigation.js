export function openReferencePdfInWorkspace({
  key,
  referencesStore,
  editorStore,
  workspace,
} = {}) {
  const refKey = String(key || '').trim()
  if (!refKey) return null

  const pdfPath = referencesStore?.pdfPathForKey?.(refKey)
  if (!pdfPath) return null

  workspace?.openWorkspaceSurface?.()
  editorStore?.openFile?.(pdfPath)
  return pdfPath
}
