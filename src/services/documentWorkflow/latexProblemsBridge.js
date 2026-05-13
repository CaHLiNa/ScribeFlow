import { invokeDocumentWorkflowBridge } from './invokeBridge.js'

export async function resolveDocumentWorkflowLatexProblems(params = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_latex_problems_resolve', params)
}
