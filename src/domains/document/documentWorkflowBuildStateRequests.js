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

export function buildPreviewStateRequest(filePath, adapter, context, options = {}) {
  if (!adapter) return null

  const previewMetadata = adapter.preview || {}
  const supportedPreviewKinds = Array.isArray(previewMetadata.supportedKinds)
    ? previewMetadata.supportedKinds
    : []
  const persistentState = context.workflowStore?.snapshotPersistentState?.() || {}
  return {
    path: filePath,
    sourcePath: options.sourcePath || '',
    workflowKind: adapter.kind,
    previewKind: options.previewKind || '',
    workspacePreviewRequest: options.workspacePreviewRequest || '',
    supportedPreviewKinds,
    resolvedTargetPath: resolveResolvedPreviewTargetPath(filePath, adapter, context, options),
    artifactPath: resolveExpectedPreviewTargetPath(filePath, adapter, context, options),
    targetResolution: options.targetResolution || '',
    previewRequested: options.previewRequested === true,
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
