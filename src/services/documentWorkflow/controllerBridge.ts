import { invokeDocumentWorkflowBridge } from './invokeBridge.ts'

export async function executeDocumentWorkflowController(params = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_controller_execute', params)
}
