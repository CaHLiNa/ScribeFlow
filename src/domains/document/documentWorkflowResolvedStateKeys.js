function stableContentFingerprint(value = '') {
  const text = String(value || '')
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`
}

export function buildResolvedMarkdownDraftProblemsKey(request = {}) {
  return JSON.stringify({
    sourcePath: String(request.sourcePath || ''),
    fingerprint: stableContentFingerprint(request.content),
  })
}

export function buildResolvedLatexProblemsKey(request = {}) {
  return JSON.stringify({
    sourcePath: String(request.sourcePath || ''),
    state: request.state || null,
  })
}

export function buildResolvedPythonProblemsKey(request = {}) {
  return JSON.stringify({
    sourcePath: String(request.sourcePath || ''),
    state: request.state || null,
  })
}

export function buildResolvedWorkspacePreviewStateKey(request = {}) {
  const state = request.state || {}
  const session = state.session || {}
  return JSON.stringify({
    path: String(request.path || ''),
    sourcePath: String(request.sourcePath || ''),
    workflowKind: String(request.workflowKind || ''),
    workflowPreviewKind: String(request.workflowPreviewKind || ''),
    previewKind: String(request.previewKind || ''),
    defaultPreviewKind: String(request.defaultPreviewKind || ''),
    preferredPreviewKind: String(request.preferredPreviewKind || ''),
    workspacePreviewRequest: String(request.workspacePreviewRequest || ''),
    supportedPreviewKinds: Array.isArray(request.supportedPreviewKinds)
      ? request.supportedPreviewKinds
      : [],
    resolvedTargetPath: String(request.resolvedTargetPath || ''),
    artifactPath: String(request.artifactPath || ''),
    targetResolution: String(request.targetResolution || ''),
    hiddenByUser: request.hiddenByUser === true,
    previewRequested: request.previewRequested === true,
    session: {
      activeFile: String(session.activeFile || ''),
      previewKind: String(session.previewKind || ''),
      previewSourcePath: String(session.previewSourcePath || ''),
      state: String(session.state || ''),
    },
    workspacePreviewVisibility: state.workspacePreviewVisibility || {},
    workspacePreviewRequests: state.workspacePreviewRequests || {},
  })
}

export function buildResolvedWorkflowUiStateKey(request = {}) {
  return JSON.stringify({
    filePath: String(request.filePath || ''),
    artifactPath: String(request.artifactPath || ''),
    previewState: request.previewState || null,
    markdownState: request.markdownState || null,
    latexState: request.latexState || null,
    pythonState: request.pythonState || null,
    queueState: request.queueState || null,
  })
}
