import {
  buildResolvedLatexProblemsKey,
  buildResolvedMarkdownDraftProblemsKey,
  buildResolvedPythonProblemsKey,
  buildResolvedWorkspacePreviewStateKey,
  buildResolvedWorkflowUiStateKey,
} from '../domains/document/documentWorkflowResolvedStateKeys.ts'
import { resolveDocumentWorkflowUiState as resolveDocumentWorkflowUiStateFromBackend } from '../services/documentWorkflow/workflowUiStateBridge.ts'
import { resolveDocumentWorkspacePreviewState as resolveDocumentWorkspacePreviewStateFromBackend } from '../services/documentWorkflow/workspacePreviewStateBridge.ts'
import { resolveDocumentWorkflowLatexProblems as resolveDocumentWorkflowLatexProblemsFromBackend } from '../services/documentWorkflow/latexProblemsBridge.ts'
import { resolveDocumentWorkflowPythonProblems as resolveDocumentWorkflowPythonProblemsFromBackend } from '../services/documentWorkflow/pythonProblemsBridge.ts'
import { extractMarkdownDraftProblems } from '../services/markdown/runtimeBridge.ts'

export const documentWorkflowResolvedStateActions = {
  buildResolvedLatexProblemsKey,
  buildResolvedMarkdownDraftProblemsKey,
  buildResolvedPythonProblemsKey,
  buildResolvedWorkspacePreviewStateKey,
  buildResolvedWorkflowUiStateKey,

  getResolvedMarkdownDraftProblems(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null
    const entry = this.resolvedMarkdownDraftProblems?.[normalizedPath] || null
    if (!entry) return null
    const key = this.buildResolvedMarkdownDraftProblemsKey(request)
    return entry.key === key ? entry.problems : null
  },

  setResolvedMarkdownDraftProblems(filePath, request = {}, problems = []) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return
    this.resolvedMarkdownDraftProblems = {
      ...this.resolvedMarkdownDraftProblems,
      [normalizedPath]: {
        key: this.buildResolvedMarkdownDraftProblemsKey(request),
        problems: Array.isArray(problems) ? problems : [],
      },
    }
  },

  async refreshResolvedMarkdownDraftProblems(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null

    if (!this._resolvedMarkdownDraftProblemsInflight) {
      this._resolvedMarkdownDraftProblemsInflight = new Map()
    }

    const key = this.buildResolvedMarkdownDraftProblemsKey(request)
    const inflightKey = `${normalizedPath}::${key}`
    if (this._resolvedMarkdownDraftProblemsInflight.has(inflightKey)) {
      return this._resolvedMarkdownDraftProblemsInflight.get(inflightKey)
    }

    const task = extractMarkdownDraftProblems(
      String(request.content || ''),
      String(request.sourcePath || normalizedPath),
    )
      .then((problems) => {
        const normalized = Array.isArray(problems) ? problems : []
        this.setResolvedMarkdownDraftProblems(normalizedPath, request, normalized)
        return normalized
      })
      .catch(() => null)
      .finally(() => {
        this._resolvedMarkdownDraftProblemsInflight.delete(inflightKey)
      })

    this._resolvedMarkdownDraftProblemsInflight.set(inflightKey, task)
    return task
  },

  ensureResolvedMarkdownDraftProblems(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null
    const cached = this.getResolvedMarkdownDraftProblems(normalizedPath, request)
    if (cached) return cached
    void this.refreshResolvedMarkdownDraftProblems(normalizedPath, request)
    return null
  },

  getResolvedLatexProblems(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null
    const entry = this.resolvedLatexProblems?.[normalizedPath] || null
    if (!entry) return null
    const key = this.buildResolvedLatexProblemsKey(request)
    return entry.key === key ? entry.problems : null
  },

  setResolvedLatexProblems(filePath, request = {}, problems = []) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return
    this.resolvedLatexProblems = {
      ...this.resolvedLatexProblems,
      [normalizedPath]: {
        key: this.buildResolvedLatexProblemsKey(request),
        problems: Array.isArray(problems) ? problems : [],
      },
    }
  },

  async refreshResolvedLatexProblems(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null

    if (!this._resolvedLatexProblemsInflight) {
      this._resolvedLatexProblemsInflight = new Map()
    }

    const key = this.buildResolvedLatexProblemsKey(request)
    const inflightKey = `${normalizedPath}::${key}`
    if (this._resolvedLatexProblemsInflight.has(inflightKey)) {
      return this._resolvedLatexProblemsInflight.get(inflightKey)
    }

    const task = resolveDocumentWorkflowLatexProblemsFromBackend(request)
      .then((problems) => {
        const normalized = Array.isArray(problems) ? problems : []
        this.setResolvedLatexProblems(normalizedPath, request, normalized)
        return normalized
      })
      .catch(() => null)
      .finally(() => {
        this._resolvedLatexProblemsInflight.delete(inflightKey)
      })

    this._resolvedLatexProblemsInflight.set(inflightKey, task)
    return task
  },

  ensureResolvedLatexProblems(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null
    const cached = this.getResolvedLatexProblems(normalizedPath, request)
    if (cached) return cached
    void this.refreshResolvedLatexProblems(normalizedPath, request)
    return null
  },

  getResolvedPythonProblems(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null
    const entry = this.resolvedPythonProblems?.[normalizedPath] || null
    if (!entry) return null
    const key = this.buildResolvedPythonProblemsKey(request)
    return entry.key === key ? entry.problems : null
  },

  setResolvedPythonProblems(filePath, request = {}, problems = []) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return
    this.resolvedPythonProblems = {
      ...this.resolvedPythonProblems,
      [normalizedPath]: {
        key: this.buildResolvedPythonProblemsKey(request),
        problems: Array.isArray(problems) ? problems : [],
      },
    }
  },

  async refreshResolvedPythonProblems(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null

    if (!this._resolvedPythonProblemsInflight) {
      this._resolvedPythonProblemsInflight = new Map()
    }

    const key = this.buildResolvedPythonProblemsKey(request)
    const inflightKey = `${normalizedPath}::${key}`
    if (this._resolvedPythonProblemsInflight.has(inflightKey)) {
      return this._resolvedPythonProblemsInflight.get(inflightKey)
    }

    const task = resolveDocumentWorkflowPythonProblemsFromBackend(request)
      .then((problems) => {
        const normalized = Array.isArray(problems) ? problems : []
        this.setResolvedPythonProblems(normalizedPath, request, normalized)
        return normalized
      })
      .catch(() => null)
      .finally(() => {
        this._resolvedPythonProblemsInflight.delete(inflightKey)
      })

    this._resolvedPythonProblemsInflight.set(inflightKey, task)
    return task
  },

  ensureResolvedPythonProblems(filePath, request = {}) {
    const normalizedPath = String(filePath || '')
    if (!normalizedPath) return null
    const cached = this.getResolvedPythonProblems(normalizedPath, request)
    if (cached) return cached
    void this.refreshResolvedPythonProblems(normalizedPath, request)
    return null
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
