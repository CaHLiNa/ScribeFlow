import { invoke } from '@tauri-apps/api/core'

export async function buildResolvedMarkdownDraftProblemsKey(request = {}) {
  return invoke('document_workflow_build_resolved_state_key', { kind: 'markdown', request })
}

export async function buildResolvedLatexProblemsKey(request = {}) {
  return invoke('document_workflow_build_resolved_state_key', { kind: 'latex', request })
}

export async function buildResolvedPythonProblemsKey(request = {}) {
  return invoke('document_workflow_build_resolved_state_key', { kind: 'python', request })
}

export async function buildResolvedWorkspacePreviewStateKey(request = {}) {
  return invoke('document_workflow_build_resolved_state_key', { kind: 'preview', request })
}

export async function buildResolvedWorkflowUiStateKey(request = {}) {
  return invoke('document_workflow_build_resolved_state_key', { kind: 'ui', request })
}
