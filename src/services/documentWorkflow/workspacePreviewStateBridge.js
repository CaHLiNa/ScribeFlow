import { invokeDocumentWorkflowBridge } from './invokeBridge.js'
import { normalizeDocumentWorkflowPersistentState } from './sessionStateBridge.js'

export async function resolveDocumentWorkspacePreviewState(params = {}) {
  return invokeDocumentWorkflowBridge('document_workspace_preview_state_resolve', {
    path: String(params.path || ''),
    sourcePath: String(params.sourcePath || ''),
    workflowKind: String(params.workflowKind || ''),
    previewKind: String(params.previewKind || ''),
    workspacePreviewRequest: String(params.workspacePreviewRequest || ''),
    resolvedTargetPath: String(params.resolvedTargetPath || ''),
    artifactPath: String(params.artifactPath || ''),
    hiddenByUser: params.hiddenByUser === true,
    previewRequested: params.previewRequested === true,
    state: normalizeDocumentWorkflowPersistentState(params.state || {}),
  })
}
