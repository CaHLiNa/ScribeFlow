import { invokeDocumentWorkflowBridge } from './invokeBridge.ts'

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
    workspaceDataDir,
  })
}

export async function saveDocumentWorkflowSessionState(workspaceDataDir = '', state = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_session_save', {
    workspaceDataDir,
    state,
  })
}

export async function reconcileDocumentWorkflowLatexPreviewState(state = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_latex_preview_reconcile', {
    state,
  })
}

export async function applyDocumentWorkflowLatexPreviewState(state = {}, filePath = '', previewState = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_latex_preview_apply', {
    state,
    filePath,
    previewState,
  })
}

export async function applyDocumentWorkflowPreviewBindingState(state = {}, intent = '', binding = {}, previewPath = '') {
  return invokeDocumentWorkflowBridge('document_workflow_preview_binding_apply', {
    state,
    intent,
    binding,
    previewPath,
  })
}

export async function resolveDocumentWorkflowPreviewCloseEffect(previewPath = '', previewBinding = null) {
  return invokeDocumentWorkflowBridge('document_workflow_preview_close_effect_resolve', {
    previewPath,
    previewBinding,
  })
}

export async function applyDocumentWorkflowSessionMutation(state = {}, mutation = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_session_mutation_apply', {
    state,
    intent: mutation?.intent,
    filePath: mutation?.filePath,
    sourcePath: mutation?.sourcePath,
    visibility: mutation?.visibility,
    previewKind: mutation?.previewKind,
    sessionPatch: mutation?.sessionPatch,
  })
}
