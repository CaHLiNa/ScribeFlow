import { invokeDocumentWorkflowBridge } from './invokeBridge.js'
import { normalizeDocumentWorkflowPersistentState } from './sessionStateBridge.js'

export async function resolveDocumentWorkspacePreviewState(params = {}) {
  return invokeDocumentWorkflowBridge('document_workspace_preview_state_resolve', {
    path: String(params.path || ''),
    sourcePath: String(params.sourcePath || ''),
    workflowKind: String(params.workflowKind || ''),
    workflowPreviewKind: String(params.workflowPreviewKind || ''),
    previewKind: String(params.previewKind || ''),
    defaultPreviewKind: String(params.defaultPreviewKind || ''),
    preferredPreviewKind: String(params.preferredPreviewKind || ''),
    workspacePreviewRequest: String(params.workspacePreviewRequest || ''),
    supportedPreviewKinds: Array.isArray(params.supportedPreviewKinds)
      ? params.supportedPreviewKinds.map((kind) => String(kind || ''))
      : [],
    resolvedTargetPath: String(params.resolvedTargetPath || ''),
    artifactPath: String(params.artifactPath || ''),
    targetResolution: String(params.targetResolution || ''),
    hiddenByUser: params.hiddenByUser === true,
    previewRequested: params.previewRequested === true,
    artifactReady: params.artifactReady === true,
    state: normalizeDocumentWorkflowPersistentState(params.state || {}),
  })
}
