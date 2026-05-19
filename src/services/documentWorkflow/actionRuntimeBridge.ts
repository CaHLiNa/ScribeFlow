import { invokeDocumentWorkflowBridge } from './invokeBridge.ts'

export async function resolveDocumentWorkflowAction(params = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_action_resolve', params)
}
