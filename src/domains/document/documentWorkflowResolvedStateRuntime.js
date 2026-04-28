import { resolveDocumentWorkflowUiState as resolveDocumentWorkflowUiStateFromBackend } from '../../services/documentWorkflow/workflowUiStateBridge.js'
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

  buildResolvedWorkflowUiStateKey(request = {}) {
    return JSON.stringify({
      filePath: String(request.filePath || ''),
      artifactPath: String(request.artifactPath || ''),
      previewState: request.previewState || null,
      markdownState: request.markdownState || null,
      latexState: request.latexState || null,
      pythonState: request.pythonState || null,
      queueState: request.queueState || null,
    })
  },

  getResolvedWorkflowUiState(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null
    const entry = this.resolvedWorkflowUiStates[normalizedPath] || null
    if (!entry) return null
    const key = this.buildResolvedWorkflowUiStateKey(request)
    return entry.key === key ? entry.state : null
  },

  setResolvedWorkflowUiState(filePath, request = {}, state = null) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return
    this.resolvedWorkflowUiStates = {
      ...this.resolvedWorkflowUiStates,
      [normalizedPath]: {
        key: this.buildResolvedWorkflowUiStateKey(request),
        state,
      },
    }
  },

  async refreshResolvedWorkflowUiState(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null

    if (!this._resolvedWorkflowUiStateInflight) {
      this._resolvedWorkflowUiStateInflight = new Map()
    }

    const key = this.buildResolvedWorkflowUiStateKey(request)
    const inflightKey = `${normalizedPath}::${key}`
    if (this._resolvedWorkflowUiStateInflight.has(inflightKey)) {
      return this._resolvedWorkflowUiStateInflight.get(inflightKey)
    }

    const task = resolveDocumentWorkflowUiStateFromBackend(request)
      .then((state) => {
        this.setResolvedWorkflowUiState(normalizedPath, request, state)
        return state
      })
      .catch(() => null)
      .finally(() => {
        this._resolvedWorkflowUiStateInflight.delete(inflightKey)
      })

    this._resolvedWorkflowUiStateInflight.set(inflightKey, task)
    return task
  },

  ensureResolvedWorkflowUiState(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null
    const cached = this.getResolvedWorkflowUiState(normalizedPath, request)
    if (cached) return cached
    void this.refreshResolvedWorkflowUiState(normalizedPath, request)
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
