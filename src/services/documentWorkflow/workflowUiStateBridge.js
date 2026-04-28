import { invokeDocumentWorkflowBridge } from './invokeBridge.js'

export async function resolveDocumentWorkflowState(params = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_state_resolve', {
    filePath: String(params.filePath || ''),
    previewState: params.previewState || null,
    markdownState: params.markdownState || null,
    markdownDraftProblems: params.markdownDraftProblems || null,
    latexState: params.latexState || null,
    latexLintDiagnostics: params.latexLintDiagnostics || null,
    workspacePath: String(params.workspacePath || ''),
    sourceContent: typeof params.sourceContent === 'string' ? params.sourceContent : '',
    pythonState: params.pythonState || null,
    queueState: params.queueState || null,
    artifactPath: String(params.artifactPath || ''),
  })
}

export const resolveDocumentWorkflowUiState = resolveDocumentWorkflowState
