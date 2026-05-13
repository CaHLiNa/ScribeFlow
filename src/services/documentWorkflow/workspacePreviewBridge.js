import { invokeDocumentWorkflowBridge } from './invokeBridge.js'

export async function applyDocumentWorkspacePreviewState(params = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_workspace_preview_apply', params)
}
