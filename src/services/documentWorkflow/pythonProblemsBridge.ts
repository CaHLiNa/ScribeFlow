import { invokeDocumentWorkflowBridge } from './invokeBridge.ts'

export async function resolveDocumentWorkflowPythonProblems(params = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_python_problems_resolve', params)
}
