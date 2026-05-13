import { invokeDocumentWorkflowBridge } from './invokeBridge.js'

export async function resolveDocumentWorkflowUiState(params = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_ui_resolve', params)
}
