import { invokeDocumentWorkflowBridge } from '../../services/documentWorkflow/invokeBridge.js'

export const documentWorkflowResolvedStateActions = {
  buildResolvedWorkflowContextKey(request = {}) {
    return JSON.stringify({
      filePath: String(request.filePath || ''),
      previewPrefs: request.previewPrefs || null,
      session: request.session || null,
      workspacePreviewRequests: request.workspacePreviewRequests || null,
      workspacePreviewVisibility: request.workspacePreviewVisibility || null,
      markdownState: request.markdownState || null,
      markdownDraftProblems: request.markdownDraftProblems || null,
      latexState: request.latexState || null,
      latexLintDiagnostics: request.latexLintDiagnostics || null,
      workspacePath: String(request.workspacePath || ''),
      sourceRevision: Number(request.sourceRevision || 0),
      pythonState: request.pythonState || null,
      queueState: request.queueState || null,
      persistedArtifactPath: String(request.persistedArtifactPath || ''),
      nativePreviewSupported: request.nativePreviewSupported !== false,
    })
  },

  getResolvedWorkflowContext(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null
    const entry = this.resolvedWorkflowContexts[normalizedPath] || null
    if (!entry) return null
    const key = this.buildResolvedWorkflowContextKey(request)
    return entry.key === key ? entry.context : null
  },

  setResolvedWorkflowContext(filePath, request = {}, context = null) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return
    this.resolvedWorkflowContexts = {
      ...this.resolvedWorkflowContexts,
      [normalizedPath]: {
        key: this.buildResolvedWorkflowContextKey(request),
        context,
      },
    }
  },

  async refreshResolvedWorkflowContext(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null

    if (!this._resolvedWorkflowContextInflight) {
      this._resolvedWorkflowContextInflight = new Map()
    }

    const key = this.buildResolvedWorkflowContextKey(request)
    const inflightKey = `${normalizedPath}::${key}`
    if (this._resolvedWorkflowContextInflight.has(inflightKey)) {
      return this._resolvedWorkflowContextInflight.get(inflightKey)
    }

    const task = invokeDocumentWorkflowBridge('document_workflow_context_resolve', request)
      .then((context) => {
        this.setResolvedWorkflowContext(normalizedPath, request, context)
        return context
      })
      .catch(() => null)
      .finally(() => {
        this._resolvedWorkflowContextInflight.delete(inflightKey)
      })

    this._resolvedWorkflowContextInflight.set(inflightKey, task)
    return task
  },

  ensureResolvedWorkflowContext(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null
    const cached = this.getResolvedWorkflowContext(normalizedPath, request)
    if (cached) return cached
    void this.refreshResolvedWorkflowContext(normalizedPath, request)
    return null
  },
}
