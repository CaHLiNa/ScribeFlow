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

function normalizeString(value = '') {
  return String(value || '').trim()
}

function normalizeStringRecord(value = {}) {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [normalizeString(key), normalizeString(entry)])
      .filter(([key, entry]) => key && entry),
  )
}

function normalizeLatexPreviewStates(value = {}) {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, state = {}]) => [
        normalizeString(key),
        {
          artifactPath: normalizeString(state?.artifactPath),
          synctexPath: normalizeString(state?.synctexPath),
          compileTargetPath: normalizeString(state?.compileTargetPath),
          lastCompiled: Number(state?.lastCompiled || 0),
          sourceFingerprint: normalizeString(state?.sourceFingerprint),
        },
      ])
      .filter(([key]) => key),
  )
}

function normalizeDocumentWorkflowPersistentState(state = {}) {
  const defaults = createDocumentWorkflowPersistentState()
  const session = state?.session || {}

  return {
    previewPrefs: state?.previewPrefs || defaults.previewPrefs,
    session: {
      activeFile: normalizeString(session.activeFile),
      activeKind: normalizeString(session.activeKind),
      sourcePaneId: normalizeString(session.sourcePaneId),
      previewPaneId: normalizeString(session.previewPaneId),
      previewKind: normalizeString(session.previewKind),
      previewSourcePath: normalizeString(session.previewSourcePath),
      state: normalizeString(session.state) || defaults.session.state,
      detachedSources: session.detachedSources || {},
    },
    previewBindings: (Array.isArray(state?.previewBindings) ? state.previewBindings : [])
      .filter((binding) => binding && typeof binding === 'object')
      .map((binding) => ({
        previewPath: normalizeString(binding.previewPath),
        sourcePath: normalizeString(binding.sourcePath),
        previewKind: normalizeString(binding.previewKind),
        kind: normalizeString(binding.kind),
        paneId: normalizeString(binding.paneId),
        detachOnClose: binding.detachOnClose !== false,
      })),
    workspacePreviewVisibility: normalizeStringRecord(state?.workspacePreviewVisibility),
    workspacePreviewRequests: normalizeStringRecord(state?.workspacePreviewRequests),
    latexArtifactPaths: normalizeStringRecord(state?.latexArtifactPaths),
    latexPreviewStates: normalizeLatexPreviewStates(state?.latexPreviewStates),
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
    state: normalizeDocumentWorkflowPersistentState(state),
  })
}

export async function reconcileDocumentWorkflowLatexPreviewState(state = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_latex_preview_reconcile', {
    state: normalizeDocumentWorkflowPersistentState(state),
  })
}

export async function applyDocumentWorkflowLatexPreviewState(state = {}, filePath = '', previewState = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_latex_preview_apply', {
    state: normalizeDocumentWorkflowPersistentState(state),
    filePath: normalizeString(filePath),
    previewState: {
      artifactPath: normalizeString(previewState?.artifactPath),
      synctexPath: normalizeString(previewState?.synctexPath),
      compileTargetPath: normalizeString(previewState?.compileTargetPath),
      lastCompiled: Number(previewState?.lastCompiled || 0),
      sourceFingerprint: normalizeString(previewState?.sourceFingerprint),
    },
  })
}

export async function applyDocumentWorkflowPreviewBindingState(state = {}, intent = '', binding = {}, previewPath = '') {
  return invokeDocumentWorkflowBridge('document_workflow_preview_binding_apply', {
    state: normalizeDocumentWorkflowPersistentState(state),
    intent: normalizeString(intent),
    binding: {
      previewPath: normalizeString(binding?.previewPath),
      sourcePath: normalizeString(binding?.sourcePath),
      previewKind: normalizeString(binding?.previewKind),
      kind: normalizeString(binding?.kind),
      paneId: normalizeString(binding?.paneId),
      detachOnClose: binding?.detachOnClose !== false,
    },
    previewPath: normalizeString(previewPath),
  })
}

export async function applyDocumentWorkflowSessionMutation(state = {}, mutation = {}) {
  return invokeDocumentWorkflowBridge('document_workflow_session_mutation_apply', {
    state: normalizeDocumentWorkflowPersistentState(state),
    intent: normalizeString(mutation?.intent),
    filePath: normalizeString(mutation?.filePath),
    sourcePath: normalizeString(mutation?.sourcePath),
    visibility: normalizeString(mutation?.visibility),
    previewKind: normalizeString(mutation?.previewKind),
    sessionPatch: mutation?.sessionPatch && typeof mutation.sessionPatch === 'object' ? mutation.sessionPatch : {},
  })
}
