import { invokeDocumentWorkflowBridge } from './invokeBridge.js'

export async function executeDocumentWorkflowController(params = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_controller_execute', params)
}
