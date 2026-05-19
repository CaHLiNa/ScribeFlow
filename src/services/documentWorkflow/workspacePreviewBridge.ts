import { invokeDocumentWorkflowBridge } from './invokeBridge.ts'

export async function applyDocumentWorkspacePreviewState(params = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_workspace_preview_apply', params)
}
