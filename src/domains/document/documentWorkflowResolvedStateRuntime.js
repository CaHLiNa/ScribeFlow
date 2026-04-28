import { resolveDocumentWorkflowState as resolveDocumentWorkflowStateFromBackend } from '../../services/documentWorkflow/workflowUiStateBridge.js'
import { resolveDocumentWorkspacePreviewState as resolveDocumentWorkspacePreviewStateFromBackend } from '../../services/documentWorkflow/workspacePreviewStateBridge.js'

export const documentWorkflowResolvedStateActions = {
  buildResolvedWorkspacePreviewStateKey(request = {}) {
    return JSON.stringify({
      path: String(request.path || ''),
      sourcePath: String(request.sourcePath || ''),
      workflowKind: String(request.workflowKind || ''),
      workflowPreviewKind: String(request.workflowPreviewKind || ''),
      previewKind: String(request.previewKind || ''),
      resolvedTargetPath: String(request.resolvedTargetPath || ''),
      targetResolution: String(request.targetResolution || ''),
      hiddenByUser: request.hiddenByUser === true,
      previewRequested: request.previewRequested === true,
      artifactReady: request.artifactReady === true,
    })
  },

  getResolvedWorkspacePreviewState(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null
    const entry = this.resolvedWorkspacePreviewStates[normalizedPath] || null
    if (!entry) return null
    const key = this.buildResolvedWorkspacePreviewStateKey(request)
    return entry.key === key ? entry.state : null
  },

  setResolvedWorkspacePreviewState(filePath, request = {}, state = null) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return
    this.resolvedWorkspacePreviewStates = {
      ...this.resolvedWorkspacePreviewStates,
      [normalizedPath]: {
        key: this.buildResolvedWorkspacePreviewStateKey(request),
        state,
      },
    }
  },

  buildResolvedWorkflowStateKey(request = {}) {
    return JSON.stringify({
      filePath: String(request.filePath || ''),
      artifactPath: String(request.artifactPath || ''),
      previewState: request.previewState || null,
      markdownState: request.markdownState || null,
      markdownDraftProblems: request.markdownDraftProblems || null,
      latexState: request.latexState || null,
      latexLintDiagnostics: request.latexLintDiagnostics || null,
      workspacePath: String(request.workspacePath || ''),
      sourceContent: String(request.sourceContent || ''),
      pythonState: request.pythonState || null,
      queueState: request.queueState || null,
    })
  },

  getResolvedWorkflowState(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null
    const entry = this.resolvedWorkflowStates[normalizedPath] || null
    if (!entry) return null
    const key = this.buildResolvedWorkflowStateKey(request)
    return entry.key === key ? entry.state : null
  },

  setResolvedWorkflowState(filePath, request = {}, state = null) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return
    this.resolvedWorkflowStates = {
      ...this.resolvedWorkflowStates,
      [normalizedPath]: {
        key: this.buildResolvedWorkflowStateKey(request),
        state,
      },
    }
  },

  async refreshResolvedWorkflowState(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null

    if (!this._resolvedWorkflowStateInflight) {
      this._resolvedWorkflowStateInflight = new Map()
    }

    const key = this.buildResolvedWorkflowStateKey(request)
    const inflightKey = `${normalizedPath}::${key}`
    if (this._resolvedWorkflowStateInflight.has(inflightKey)) {
      return this._resolvedWorkflowStateInflight.get(inflightKey)
    }

    const task = resolveDocumentWorkflowStateFromBackend(request)
      .then((state) => {
        this.setResolvedWorkflowState(normalizedPath, request, state)
        return state
      })
      .catch(() => null)
      .finally(() => {
        this._resolvedWorkflowStateInflight.delete(inflightKey)
      })

    this._resolvedWorkflowStateInflight.set(inflightKey, task)
    return task
  },

  ensureResolvedWorkflowState(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null
    const cached = this.getResolvedWorkflowState(normalizedPath, request)
    if (cached) return cached
    void this.refreshResolvedWorkflowState(normalizedPath, request)
    return null
  },

  async refreshResolvedWorkspacePreviewState(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null

    if (!this._resolvedWorkspacePreviewStateInflight) {
      this._resolvedWorkspacePreviewStateInflight = new Map()
    }

    const key = this.buildResolvedWorkspacePreviewStateKey(request)
    const inflightKey = `${normalizedPath}::${key}`
    if (this._resolvedWorkspacePreviewStateInflight.has(inflightKey)) {
      return this._resolvedWorkspacePreviewStateInflight.get(inflightKey)
    }

    const task = resolveDocumentWorkspacePreviewStateFromBackend(request)
      .then((state) => {
        this.setResolvedWorkspacePreviewState(normalizedPath, request, state)
        return state
      })
      .catch(() => null)
      .finally(() => {
        this._resolvedWorkspacePreviewStateInflight.delete(inflightKey)
      })

    this._resolvedWorkspacePreviewStateInflight.set(inflightKey, task)
    return task
  },

  ensureResolvedWorkspacePreviewState(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null
    const cached = this.getResolvedWorkspacePreviewState(normalizedPath, request)
    if (cached) return cached
    void this.refreshResolvedWorkspacePreviewState(normalizedPath, request)
    return null
  },
}
