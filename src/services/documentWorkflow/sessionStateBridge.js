import { isBrowserPreviewRuntime } from '../../app/browserPreview/routes.js'
import { clearStorageKeys, hasDesktopInvoke, readStorageJson } from '../bridgeStorage.js'
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

function loadBrowserPreviewState() {
  const base = createDocumentWorkflowPersistentState()
  return {
    ...base,
    previewPrefs: readLegacyPreviewPrefs(),
  }
}

export async function loadDocumentWorkflowSessionState(workspaceDataDir = '') {
  if (isBrowserPreviewRuntime() || !hasDesktopInvoke()) {
    return loadBrowserPreviewState()
  }

  const state = await invokeDocumentWorkflowBridge('document_workflow_session_load', {
    workspaceDataDir: String(workspaceDataDir || ''),
    legacyState: {
      ...createDocumentWorkflowPersistentState(),
      previewPrefs: readLegacyPreviewPrefs(),
    },
  })

  clearLegacyPreviewPrefs()
  return {
    ...createDocumentWorkflowPersistentState(),
    ...state,
  }
}

export async function saveDocumentWorkflowSessionState(workspaceDataDir = '', state = {}) {
  if (isBrowserPreviewRuntime() || !hasDesktopInvoke()) {
    return {
      ...createDocumentWorkflowPersistentState(),
      ...state,
    }
  }

  const normalized = await invokeDocumentWorkflowBridge('document_workflow_session_save', {
    workspaceDataDir: String(workspaceDataDir || ''),
    state,
  })

  clearLegacyPreviewPrefs()
  return {
    ...createDocumentWorkflowPersistentState(),
    ...normalized,
  }
}
