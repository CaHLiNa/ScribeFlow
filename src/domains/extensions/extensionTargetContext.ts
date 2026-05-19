import { isPreviewPath, previewSourcePathFromPath } from '../../utils/fileTypes'

export function resolveExtensionTargetContext({
  workspaceLeftSidebarPanel = '',
  selectedReference = null,
  activeTab = '',
} = {}) {
  if (workspaceLeftSidebarPanel === 'references' && selectedReference?.pdfPath) {
    return {
      kind: 'referencePdf',
      referenceId: String(selectedReference.id || ''),
      path: String(selectedReference.pdfPath || ''),
    }
  }

  const normalizedActiveTab = String(activeTab || '').trim()
  const sourcePath = isPreviewPath(normalizedActiveTab)
    ? previewSourcePathFromPath(normalizedActiveTab)
    : normalizedActiveTab
  const normalizedPath = String(sourcePath || '').trim()
  return {
    kind: normalizedPath.toLowerCase().endsWith('.pdf') ? 'pdf' : 'workspace',
    referenceId: '',
    path: normalizedPath,
  }
}
