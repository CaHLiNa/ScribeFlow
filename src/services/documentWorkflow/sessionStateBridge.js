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
    state,
  })
}
