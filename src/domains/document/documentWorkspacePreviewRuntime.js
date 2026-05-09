import {
  isLatex,
  isMarkdown,
} from '../../utils/fileTypes.js'

function getWorkspaceDocumentKind(path = '', workflowUiState = null) {
  if (workflowUiState?.kind && workflowUiState.kind !== 'text') return workflowUiState.kind
  if (!path || typeof path !== 'string') return null
  if (isMarkdown(path)) return 'markdown'
  if (isLatex(path)) return 'latex'
  return null
}

export function shouldUseDocumentWorkspaceTab(path = '', workflowUiState = null) {
  return getWorkspaceDocumentKind(path, workflowUiState) !== null
}

export function resolveDocumentWorkspaceTextRoute(options = {}) {
  const activeTab = options.activeTab || ''
  const viewerType = options.viewerType || null
  const documentPreviewState = options.documentPreviewState || null
  const workflowUiState = options.workflowUiState || null
  const useWorkspaceSurface =
    viewerType === 'text' && shouldUseDocumentWorkspaceTab(activeTab, workflowUiState)

  return {
    useWorkspaceSurface,
    previewVisible: false,
    previewMode: useWorkspaceSurface ? documentPreviewState?.previewMode || null : null,
    previewTargetPath: useWorkspaceSurface ? documentPreviewState?.previewTargetPath || '' : '',
    previewFilePath: useWorkspaceSurface ? documentPreviewState?.previewFilePath || '' : '',
    toolbarTargetVisible: false,
  }
}
