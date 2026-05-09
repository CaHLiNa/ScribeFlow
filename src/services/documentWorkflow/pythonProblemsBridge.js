import { invokeDocumentWorkflowBridge } from './invokeBridge.js'

export async function resolveDocumentWorkflowPythonProblems(params = {}) {
  const problems = await invokeDocumentWorkflowBridge('document_workflow_python_problems_resolve', {
    sourcePath: String(params.sourcePath || ''),
    state: params.state && typeof params.state === 'object' ? params.state : {},
  })
  return Array.isArray(problems) ? problems : []
}
