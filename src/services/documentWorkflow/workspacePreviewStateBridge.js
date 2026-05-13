import { invokeDocumentWorkflowBridge } from './invokeBridge.js'

export async function resolveDocumentWorkspacePreviewState(params = {}) {
  return invokeDocumentWorkflowBridge('document_workspace_preview_state_resolve', params)
}
