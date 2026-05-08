import { invokeDocumentWorkflowBridge } from './invokeBridge.js'

export async function applyDocumentWorkspacePreviewState(params = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_workspace_preview_apply', {
    state: params.state || {},
    intent: String(params.intent || ''),
    filePath: String(params.filePath || ''),
    kind: String(params.kind || ''),
    previewKind: String(params.previewKind || ''),
    preferredPreviewKind: String(params.preferredPreviewKind || ''),
    persistPreference: params.persistPreference !== false,
    sourcePaneId: String(params.sourcePaneId || ''),
  })
}
