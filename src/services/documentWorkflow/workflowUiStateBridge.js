import { invokeDocumentWorkflowBridge } from './invokeBridge.js'

export async function resolveDocumentWorkflowUiState(params = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_ui_resolve', {
    filePath: String(params.filePath || ''),
    previewState: params.previewState || null,
    markdownState: params.markdownState || null,
    latexState: params.latexState || null,
    pythonState: params.pythonState || null,
    queueState: params.queueState || null,
    artifactPath: String(params.artifactPath || ''),
  })
}
