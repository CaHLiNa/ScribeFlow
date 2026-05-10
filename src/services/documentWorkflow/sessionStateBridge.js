import { invokeDocumentWorkflowBridge } from './invokeBridge.js'

export function createDocumentWorkflowPersistentState() {
  return {
    previewPrefs: {
      markdown: {
        preferredPreview: 'html',
      },
    },
    session: {
      activeFile: '',
      activeKind: '',
      sourcePaneId: '',
      previewPaneId: '',
      previewKind: '',
      previewSourcePath: '',
      state: 'inactive',
      detachedSources: {},
    },
    previewBindings: [],
    workspacePreviewVisibility: {},
    workspacePreviewRequests: {},
    latexArtifactPaths: {},
    latexPreviewStates: {},
  }
}

export async function loadDocumentWorkflowSessionState(workspaceDataDir = '') {
  return invokeDocumentWorkflowBridge('document_workflow_session_load', {
    workspaceDataDir: String(workspaceDataDir || ''),
  })
}

export async function saveDocumentWorkflowSessionState(workspaceDataDir = '', state = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_session_save', {
    workspaceDataDir: String(workspaceDataDir || ''),
    state: state || {},
  })
}

export async function reconcileDocumentWorkflowLatexPreviewState(state = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_latex_preview_reconcile', {
    state: state || {},
  })
}

export async function applyDocumentWorkflowLatexPreviewState(state = {}, filePath = '', previewState = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_latex_preview_apply', {
    state: state || {},
    filePath: String(filePath || ''),
    previewState: previewState || {},
  })
}

export async function applyDocumentWorkflowPreviewBindingState(state = {}, intent = '', binding = {}, previewPath = '') {
  return invokeDocumentWorkflowBridge('document_workflow_preview_binding_apply', {
    state: state || {},
    intent: String(intent || ''),
    binding: binding || {},
    previewPath: String(previewPath || ''),
  })
}

export async function resolveDocumentWorkflowPreviewCloseEffect(previewPath = '', previewBinding = null) {
  return invokeDocumentWorkflowBridge('document_workflow_preview_close_effect_resolve', {
    previewPath: String(previewPath || ''),
    previewBinding: previewBinding && typeof previewBinding === 'object' ? previewBinding : null,
  })
}

export async function applyDocumentWorkflowSessionMutation(state = {}, mutation = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_session_mutation_apply', {
    state: state || {},
    intent: String(mutation?.intent || ''),
    filePath: String(mutation?.filePath || ''),
    sourcePath: String(mutation?.sourcePath || ''),
    visibility: String(mutation?.visibility || ''),
    previewKind: String(mutation?.previewKind || ''),
    sessionPatch: mutation?.sessionPatch && typeof mutation.sessionPatch === 'object' ? mutation.sessionPatch : {},
  })
}
