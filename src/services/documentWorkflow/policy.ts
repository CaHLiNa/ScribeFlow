import { invokeCommand as invoke } from '../tauriBridge.ts'

export async function resolveDocumentWorkflowPolicy(filePath, previewPrefs = {}) {
  return invoke('document_workflow_policy_resolve', {
    filePath: String(filePath || ''),
    previewPrefs: previewPrefs || {},
  })
}

export async function inferWorkflowPreviewKind(sourcePath, previewPath) {
  return invoke('document_workflow_infer_preview_kind', {
    sourcePath: String(sourcePath || ''),
    previewPath: String(previewPath || ''),
  })
}
