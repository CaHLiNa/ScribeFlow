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

export function resolveRequestedPreviewKind(filePath, adapter, options = {}, workflowStore = null) {
  if (!adapter) return null

  const session = options.session || workflowStore?.session || {}
  const preferredPreviewKind = resolvePreferredPreviewKind(adapter, options, workflowStore)
  const workspacePreviewRequest = normalizePreviewKind(
    adapter,
    options.workspacePreviewRequest,
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

export function resolveNativePreviewSupported(_filePath, _adapter, _context, _requestedPreviewKind, options = {}) {
  if (typeof options.nativePreviewSupported === 'boolean') {
    return options.nativePreviewSupported
  }
  return true
}

export function resolveArtifactReady(filePath, adapter, context) {
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

export function buildPreviewStateRequest(filePath, adapter, context, options = {}) {
  if (!adapter) return null

  const requestedPreviewKind = resolveRequestedPreviewKind(filePath, adapter, options, context.workflowStore)
  const persistentState = context.workflowStore?.snapshotPersistentState?.() || {}
  return {
    path: filePath,
    sourcePath: options.sourcePath || '',
    workflowKind: adapter.kind,
    workflowPreviewKind: requestedPreviewKind || '',
    previewKind: requestedPreviewKind,
    resolvedTargetPath: resolveResolvedPreviewTargetPath(filePath, adapter, context, options),
    targetResolution: options.targetResolution || '',
    previewRequested: options.previewRequested === true,
    artifactReady: resolveArtifactReady(filePath, adapter, context),
    hiddenByUser: options.hiddenByUser === true,
    state: persistentState,
  }
}

export function buildWorkflowUiStateRequest(filePath, adapter, context, options = {}, previewState = null) {
  if (!adapter) return null
  const markdownPreviewState = adapter.kind === 'markdown'
    ? context.workflowStore?.markdownPreviewState?.[filePath] || {}
    : null

  return {
    filePath,
    artifactPath: resolveExpectedPreviewTargetPath(filePath, adapter, context, options),
    previewState,
    markdownState: adapter.kind === 'markdown'
      ? {
          ...markdownPreviewState,
          problems: adapter.getProblems?.(filePath, context) || [],
        }
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
