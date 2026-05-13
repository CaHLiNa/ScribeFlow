import { invokeDocumentWorkflowBridge } from './invokeBridge.js'

export async function resolveDocumentWorkflowPythonProblems(params = {}) {
  const problems = await invokeDocumentWorkflowBridge('document_workflow_python_problems_resolve', params)
  return Array.isArray(problems) ? problems : []
}
