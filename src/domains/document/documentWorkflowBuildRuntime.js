import {
  getDocumentAdapterForFile,
  getDocumentAdapterForWorkflow,
} from '../../services/documentWorkflow/adapters/index.js'

function resolveDocumentAdapter(filePath, options = {}) {
  if (options.adapter) return options.adapter
  if (options.workflowOnly === false) {
    return getDocumentAdapterForFile(filePath)
  }
  return getDocumentAdapterForWorkflow(filePath)
}

function resolvePreferredPreviewKind(adapter, options = {}, workflowStore = null) {
  if (!adapter) return null
  if (options.previewKind) return options.previewKind

  const getPreferredPreviewKind = (
    options.getPreferredPreviewKind
    || workflowStore?.getPreferredPreviewKind?.bind(workflowStore)
  )
  return getPreferredPreviewKind?.(adapter.kind) || adapter.preview?.defaultKind || null
}

function normalizePreviewKind(adapter, previewKind) {
  if (!adapter || !previewKind) return null
  const supportedKinds = Array.isArray(adapter.preview?.supportedKinds)
    ? adapter.preview.supportedKinds
    : []
  return supportedKinds.includes(previewKind) ? previewKind : adapter.preview?.defaultKind || null
}

function resolveRequestedPreviewKind(filePath, adapter, options = {}, workflowStore = null) {
  if (!adapter) return null

  const session = options.session || workflowStore?.session || {}
  const preferredPreviewKind = resolvePreferredPreviewKind(adapter, options, workflowStore)
  const workspacePreviewRequest = normalizePreviewKind(
    adapter,
    options.workspacePreviewRequest || workflowStore?.getWorkspacePreviewRequestForFile?.(filePath),
  )

  if (workspacePreviewRequest) {
    return workspacePreviewRequest
  }

  if (session.activeFile === filePath) {
    const sessionPreviewKind = normalizePreviewKind(adapter, session.previewKind)
    return sessionPreviewKind || preferredPreviewKind
  }
  return normalizePreviewKind(adapter, preferredPreviewKind)
}

function resolveResolvedPreviewTargetPath(filePath, adapter, context, options = {}) {
  if (options.resolvedTargetPath || options.previewTargetPath) {
    return options.resolvedTargetPath || options.previewTargetPath || ''
  }
  return adapter?.preview?.getTargetPath?.(filePath, context, options) || ''
}

function resolveExpectedPreviewTargetPath(filePath, adapter, context, options = {}) {
  if (options.expectedTargetPath) return options.expectedTargetPath
  return adapter?.compile?.getArtifactPath?.(filePath, context, options) || ''
}

function resolveNativePreviewSupported(filePath, adapter, context, requestedPreviewKind, options = {}) {
  void filePath
  void context
  void requestedPreviewKind
  if (typeof options.nativePreviewSupported === 'boolean') {
    return options.nativePreviewSupported
  }
  return true
}

function resolveArtifactReady(filePath, adapter, context) {
  if (!adapter || !filePath) return false
  if (adapter.kind === 'latex') {
    const latexState = context.latexStore?.stateForFile?.(filePath) || null
    return Boolean(
      latexState?.pdfPath
      || latexState?.previewPath
      || context.workflowStore?.getLatexArtifactPathForFile?.(filePath),
    )
  }
  return false
}

function resolvePreviewRequested(filePath, requestedPreviewKind, options = {}, workflowStore = null) {
  const session = options.session || workflowStore?.session || {}
  const activeSourcePath = session.previewSourcePath || session.activeFile || ''
  if (!activeSourcePath || activeSourcePath !== filePath) return false
  if (session.state !== 'workspace-preview') return false
  if (requestedPreviewKind && session.previewKind && session.previewKind !== requestedPreviewKind) {
    return false
  }
  return true
}

function buildPreviewStateRequest(filePath, adapter, context, options = {}) {
  if (!adapter) return null

  const requestedPreviewKind = resolveRequestedPreviewKind(filePath, adapter, options, context.workflowStore)
  return {
    path: filePath,
    sourcePath: options.sourcePath || '',
    workflowKind: adapter.kind,
    workflowPreviewKind: requestedPreviewKind || '',
    previewKind: requestedPreviewKind,
    resolvedTargetPath: resolveResolvedPreviewTargetPath(filePath, adapter, context, options),
    targetResolution: options.targetResolution || '',
    previewRequested: resolvePreviewRequested(
      filePath,
      requestedPreviewKind,
      options,
      context.workflowStore,
    ),
    artifactReady: resolveArtifactReady(filePath, adapter, context),
    hiddenByUser: context.workflowStore?.isWorkspacePreviewHiddenForFile?.(filePath) === true,
  }
}

function resolvePreviewState(filePath, adapter, context, options = {}) {
  if (!adapter) return null

  const request = buildPreviewStateRequest(filePath, adapter, context, options)
  return context.workflowStore?.ensureResolvedWorkspacePreviewState?.(filePath, request) || null
}

function buildWorkflowUiStateRequest(filePath, adapter, context, options = {}, previewState = null) {
  if (!adapter) return null

  return {
    filePath,
    artifactPath: resolveExpectedPreviewTargetPath(filePath, adapter, context, options),
    previewState,
    markdownState: adapter.kind === 'markdown'
      ? context.workflowStore?.markdownPreviewState?.[filePath] || {}
      : null,
    latexState: adapter.kind === 'latex'
      ? context.latexStore?.stateForFile?.(filePath) || {}
      : null,
    pythonState: adapter.kind === 'python'
      ? context.pythonStore?.stateForFile?.(filePath) || {}
      : null,
    queueState: adapter.kind === 'latex'
      ? context.latexStore?.queueStateForFile?.(filePath) || {}
      : null,
  }
}

function resolveWorkflowUiState(filePath, adapter, context, options = {}, previewState = null) {
  if (!adapter) return null
  const request = buildWorkflowUiStateRequest(filePath, adapter, context, options, previewState)
  return context.workflowStore?.ensureResolvedWorkflowUiState?.(filePath, request) || null
}

export function getDocumentWorkflowStatusTone(uiState = null) {
  if (!uiState) return 'muted'
  if (uiState.kind === 'markdown') {
    if (uiState.exportPhase === 'exporting' || uiState.phase === 'rendering') return 'running'
    if (uiState.phase === 'error') return 'error'
    if (uiState.exportPhase === 'error') return 'warning'
    if (uiState.phase === 'ready' || uiState.exportPhase === 'ready') return 'success'
    return 'muted'
  }
  if (uiState.phase === 'running' || uiState.phase === 'compiling' || uiState.phase === 'rendering') return 'running'
  if (uiState.phase === 'queued') return 'warning'
  if (uiState.phase === 'error') return 'error'
  if (uiState.phase === 'ready') return 'success'
  return 'muted'
}

export function createDocumentWorkflowBuildRuntime({
  getWorkflowStore,
  getEditorStore,
  getFilesStore,
  getWorkspaceStore,
  getLatexStore,
  getPythonStore,
} = {}) {
  function resolveBaseContext(options = {}) {
    return {
      workflowStore: getWorkflowStore?.() || null,
      editorStore: options.editorStore || getEditorStore?.() || null,
      filesStore: options.filesStore || getFilesStore?.() || null,
      chatStore: options.chatStore || null,
      workspace: options.workspace || getWorkspaceStore?.() || null,
      latexStore: options.latexStore || getLatexStore?.() || null,
      pythonStore: options.pythonStore || getPythonStore?.() || null,
      toastStore: options.toastStore || null,
      t: options.t || null,
    }
  }

  function buildAdapterContext(filePath, options = {}) {
    const context = resolveBaseContext(options)
    const adapter = resolveDocumentAdapter(filePath, options)
    if (!adapter) {
      return {
        ...context,
        adapter: null,
        previewState: null,
        workspacePreviewState: null,
        previewKind: null,
        previewMode: null,
        previewAvailable: false,
        previewVisible: false,
        previewTargetPath: '',
        targetResolution: null,
      }
    }

    const previewState = resolvePreviewState(filePath, adapter, context, options)
    const uiState = resolveWorkflowUiState(filePath, adapter, context, options, previewState)
    const artifactReady = resolveArtifactReady(filePath, adapter, context)
    const nativePreviewSupported = resolveNativePreviewSupported(
      filePath,
      adapter,
      context,
      previewState?.previewKind || null,
      options,
    )
    return {
      ...context,
      adapter,
      workflowUiState: uiState,
      previewState,
      workspacePreviewState: previewState,
      previewKind: uiState?.previewKind || previewState?.previewKind || null,
      previewMode: previewState?.previewMode || null,
      previewAvailable: previewState?.previewVisible === true,
      previewVisible: previewState?.previewVisible === true,
      previewTargetPath: previewState?.previewTargetPath || '',
      targetResolution: previewState?.targetResolution || null,
      artifactReady,
      nativePreviewSupported,
    }
  }

  function openLogForFile(filePath, options = {}) {
    const context = buildAdapterContext(filePath, options)
    context.adapter?.compile?.openLog?.(filePath, context)
  }

  function getProblemsForFile(filePath, options = {}) {
    const context = buildAdapterContext(filePath, options)
    return context.adapter?.getProblems?.(filePath, context) || []
  }

  function getUiStateForFile(filePath, options = {}) {
    return buildAdapterContext(filePath, options).workflowUiState || null
  }

  function getStatusTextForFile(filePath, options = {}) {
    const context = buildAdapterContext(filePath, options)
    return context.adapter?.compile?.getStatusText?.(filePath, context) || ''
  }

  function getArtifactPathForFile(filePath, options = {}) {
    const context = buildAdapterContext(filePath, options)
    return context.adapter?.compile?.getArtifactPath?.(filePath, context) || ''
  }

  function getWorkspacePreviewStateForFile(filePath, options = {}) {
    return buildAdapterContext(filePath, options).workspacePreviewState
  }

  return {
    buildAdapterContext,
    openLogForFile,
    getProblemsForFile,
    getUiStateForFile,
    getStatusTextForFile,
    getArtifactPathForFile,
    getWorkspacePreviewStateForFile,
    getStatusTone: getDocumentWorkflowStatusTone,
  }
}
