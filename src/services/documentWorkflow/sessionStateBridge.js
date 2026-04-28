import { clearStorageKeys, readStorageJson } from '../bridgeStorage.js'
import { invokeDocumentWorkflowBridge } from './invokeBridge.js'

const PREFS_KEY = 'documentWorkflow.previewPrefs'

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

function readLegacyPreviewPrefs() {
  return {
    ...createDocumentWorkflowPersistentState().previewPrefs,
    ...readStorageJson(PREFS_KEY, {}),
  }
}

function clearLegacyPreviewPrefs() {
  clearStorageKeys([PREFS_KEY])
}

export async function loadDocumentWorkflowSessionState(workspaceDataDir = '') {
  const state = await invokeDocumentWorkflowBridge('document_workflow_session_load', {
    workspaceDataDir: String(workspaceDataDir || ''),
    legacyState: {
      ...createDocumentWorkflowPersistentState(),
      previewPrefs: readLegacyPreviewPrefs(),
    },
  })

  clearLegacyPreviewPrefs()
  return state
}

export async function saveDocumentWorkflowSessionState(workspaceDataDir = '', state = {}) {
  const normalized = await invokeDocumentWorkflowBridge('document_workflow_session_save', {
    workspaceDataDir: String(workspaceDataDir || ''),
    state,
  })

  clearLegacyPreviewPrefs()
  return normalized
}
