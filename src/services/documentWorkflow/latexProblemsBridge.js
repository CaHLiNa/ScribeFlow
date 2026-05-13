import { invokeDocumentWorkflowBridge } from './invokeBridge.js'

export async function resolveDocumentWorkflowLatexProblems(params = {}) {
  const problems = await invokeDocumentWorkflowBridge('document_workflow_latex_problems_resolve', params)
  return Array.isArray(problems) ? problems : []
}
