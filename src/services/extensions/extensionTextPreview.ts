export async function loadExtensionTextPreviewContent({
  inlineText = '',
  previewPath = '',
  maxBytes = 4000,
  readWorkspaceText,
  readArtifactText,
} = {}) {
  const initial = String(inlineText || '')
  if (initial) return initial

  const path = String(previewPath || '').trim()
  if (!path) return ''

  try {
    return await readWorkspaceText(path, maxBytes)
  } catch (workspaceError) {
    try {
      return await readArtifactText({ path }, maxBytes)
    } catch (artifactError) {
      return artifactError?.message || String(artifactError || workspaceError || 'Preview failed.')
    }
  }
}
