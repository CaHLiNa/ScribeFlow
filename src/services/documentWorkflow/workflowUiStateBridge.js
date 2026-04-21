import { invoke } from '@tauri-apps/api/core'

export async function resolveDocumentWorkflowUiState(params = {}) {
  return invoke('document_workflow_ui_resolve', {
    params: {
      filePath: String(params.filePath || ''),
      previewState: params.previewState || null,
      markdownState: params.markdownState || null,
      latexState: params.latexState || null,
      queueState: params.queueState || null,
      artifactPath: String(params.artifactPath || ''),
    },
  })
}
