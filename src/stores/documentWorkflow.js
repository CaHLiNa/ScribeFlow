import { defineStore } from 'pinia'
import { useEditorStore } from './editor.js'
import { useLatexStore } from './latex.js'
import { useFilesStore } from './files.js'
import { useWorkspaceStore } from './workspace.js'
import { previewSourcePathFromPath } from '../utils/fileTypes.js'
import {
  createWorkflowPreviewPath,
  getDocumentWorkflowKind,
  getPreferredWorkflowPreviewKind,
  inferWorkflowPreviewKind,
  isDocumentWorkflowSource,
} from '../services/documentWorkflow/policy.js'
import {
  getDocumentAdapterCapabilities,
  getDocumentAdapterByKind,
  getDocumentAdapterForFile,
  getDocumentAdapterForWorkflow,
  listWorkflowDocumentAdapters,
} from '../services/documentWorkflow/adapters/index.js'
import { createDocumentWorkflowRuntime } from '../domains/document/documentWorkflowRuntime.js'
import { createDocumentWorkflowBuildRuntime } from '../domains/document/documentWorkflowBuildRuntime.js'
import { createDocumentWorkflowBuildOperationRuntime } from '../domains/document/documentWorkflowBuildOperationRuntime.js'
import { createDocumentWorkflowActionRuntime } from '../domains/document/documentWorkflowActionRuntime.js'
import { resolveDocumentPreviewCloseEffect } from '../domains/document/documentWorkspacePreviewRuntime.js'
import { openLocalPath } from '../services/localFileOpen.js'
import { mutateDocumentWorkspacePreview } from '../services/documentWorkflow/workspacePreviewBridge.js'
import { resolveDocumentWorkspacePreviewState as resolveDocumentWorkspacePreviewStateFromBackend } from '../services/documentWorkflow/workspacePreviewStateBridge.js'
import { resolveDocumentWorkflowUiState as resolveDocumentWorkflowUiStateFromBackend } from '../services/documentWorkflow/workflowUiStateBridge.js'

const PREFS_KEY = 'documentWorkflow.previewPrefs'

function defaultPrefs() {
  return Object.fromEntries(
    listWorkflowDocumentAdapters()
      .map(adapter => [adapter.kind, adapter.preview?.defaultKind || null])
      .filter(([, previewKind]) => !!previewKind)
      .map(([kind, previewKind]) => [kind, { preferredPreview: previewKind }]),
  )
}

function readPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return defaultPrefs()
    return {
      ...defaultPrefs(),
      ...JSON.parse(raw),
    }
  } catch {
    return defaultPrefs()
  }
}

export const useDocumentWorkflowStore = defineStore('documentWorkflow', {
  state: () => ({
    previewPrefs: readPrefs(),
    session: {
      activeFile: null,
      activeKind: null,
      sourcePaneId: null,
      previewPaneId: null,
      previewKind: null,
      previewSourcePath: null,
      state: 'inactive',
      detachedSources: {},
    },
    previewBindings: {},
    markdownPreviewState: {},
    workspacePreviewVisibility: {},
    workspacePreviewRequests: {},
    resolvedWorkspacePreviewStates: {},
    resolvedWorkflowUiStates: {},
    _isReconciling: false,
    _lastTrigger: null,
  }),

  getters: {
    isWorkflowSource: () => (filePath) => isDocumentWorkflowSource(filePath),
  },

  actions: {
    _getDocumentWorkflowRuntime() {
      if (!this._documentWorkflowRuntime) {
        this._documentWorkflowRuntime = createDocumentWorkflowRuntime({
          getSession: () => this.session,
          getPreviewPrefs: () => this.previewPrefs,
          getPreviewBindings: () => this.previewBindings,
          bindPreview: (binding) => this.bindPreview(binding),
          getPreferredPreviewKind: (kind) => this.getPreferredPreviewKind(kind),
          clearDetached: (sourcePath) => this.clearDetached(sourcePath),
          handlePreviewClosed: (previewPath) => this.handlePreviewClosed(previewPath),
          setSessionState: (payload) => this.setSessionState(payload),
          getIsReconciling: () => this._isReconciling,
          setIsReconciling: (value) => {
            this._isReconciling = value
          },
          setLastTrigger: (value) => {
            this._lastTrigger = value
          },
          getEditorStore: () => useEditorStore(),
          jumpPreviewToCursor: ({ kind, previewKind, sourcePath }) => {
            if (kind === 'latex') {
              window.dispatchEvent(new CustomEvent('latex-request-cursor', {
                detail: { texPath: sourcePath },
              }))
              return
            }

            if (kind === 'markdown' && previewKind === 'html') {
              window.dispatchEvent(new CustomEvent('markdown-request-cursor', {
                detail: { sourcePath },
              }))
            }
          },
        })
      }
      return this._documentWorkflowRuntime
    },

    _getDocumentWorkflowBuildRuntime() {
      if (!this._documentWorkflowBuildRuntime) {
        this._documentWorkflowBuildRuntime = createDocumentWorkflowBuildRuntime({
          getWorkflowStore: () => this,
          getEditorStore: () => useEditorStore(),
          getFilesStore: () => useFilesStore(),
          getWorkspaceStore: () => useWorkspaceStore(),
          getLatexStore: () => useLatexStore(),
        })
      }
      return this._documentWorkflowBuildRuntime
    },

    _getDocumentWorkflowBuildOperationRuntime() {
      if (!this._documentWorkflowBuildOperationRuntime) {
        this._documentWorkflowBuildOperationRuntime = createDocumentWorkflowBuildOperationRuntime({
          getBuildRuntime: () => this._getDocumentWorkflowBuildRuntime(),
        })
      }
      return this._documentWorkflowBuildOperationRuntime
    },

    _getDocumentWorkflowActionRuntime() {
      if (!this._documentWorkflowActionRuntime) {
        this._documentWorkflowActionRuntime = createDocumentWorkflowActionRuntime({
          getWorkflowStore: () => this,
          getBuildOperationRuntime: () => this._getDocumentWorkflowBuildOperationRuntime(),
          openOutputPath: (path) => openLocalPath(path),
        })
      }
      return this._documentWorkflowActionRuntime
    },

    persistPrefs() {
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(this.previewPrefs))
      } catch {
        return false
      }
      return true
    },

    getPreferredPreviewKind(kind) {
      return getPreferredWorkflowPreviewKind(kind, this.previewPrefs)
    },

    setPreferredPreviewKind(kind, previewKind) {
      if (!kind || !previewKind) return
      const adapter = getDocumentAdapterByKind(kind)
      if (!adapter?.preview?.supportedKinds?.includes(previewKind)) return
      this.previewPrefs = {
        ...this.previewPrefs,
        [kind]: {
          preferredPreview: previewKind,
        },
      }
      this.persistPrefs()
    },

    getPreviewBinding(previewPath) {
      return previewPath ? this.previewBindings[previewPath] || null : null
    },

    bindPreview({ previewPath, sourcePath, previewKind, kind, paneId = null, detachOnClose = true }) {
      if (!previewPath || !sourcePath) return
      this.previewBindings = {
        ...this.previewBindings,
        [previewPath]: {
          previewPath,
          sourcePath,
          previewKind,
          kind,
          paneId,
          detachOnClose,
        },
      }
    },

    unbindPreview(previewPath) {
      if (!previewPath || !this.previewBindings[previewPath]) return
      const next = { ...this.previewBindings }
      delete next[previewPath]
      this.previewBindings = next
    },

    inferPreviewKind(sourcePath, previewPath) {
      return inferWorkflowPreviewKind(sourcePath, previewPath)
    },

    markDetached(sourcePath) {
      if (!sourcePath) return
      this.session.detachedSources = {
        ...this.session.detachedSources,
        [sourcePath]: true,
      }
      if (this.session.previewSourcePath === sourcePath) {
        this.session.state = 'detached-by-user'
      }
    },

    clearDetached(sourcePath) {
      if (!sourcePath || !this.session.detachedSources[sourcePath]) return
      const next = { ...this.session.detachedSources }
      delete next[sourcePath]
      this.session.detachedSources = next
    },

    isDetached(sourcePath) {
      return !!this.session.detachedSources[sourcePath]
    },

    setMarkdownPreviewState(sourcePath, state) {
      if (!sourcePath) return
      this.markdownPreviewState = {
        ...this.markdownPreviewState,
        [sourcePath]: {
          ...(this.markdownPreviewState[sourcePath] || {}),
          ...state,
        },
      }
    },

    clearMarkdownStates(sourcePath) {
      if (!sourcePath) return
      const nextPreview = { ...this.markdownPreviewState }
      delete nextPreview[sourcePath]
      this.markdownPreviewState = nextPreview
    },

    isWorkspacePreviewHiddenForFile(filePath) {
      return this.workspacePreviewVisibility[filePath] === 'hidden'
    },

    setWorkspacePreviewVisibility(filePath, visibility = 'visible') {
      if (!filePath) return
      this.workspacePreviewVisibility = {
        ...this.workspacePreviewVisibility,
        [filePath]: visibility === 'hidden' ? 'hidden' : 'visible',
      }
    },

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
        preserveOpenLegacy: request.preserveOpenLegacy === true,
        hasOpenLegacyPreview: request.hasOpenLegacyPreview === true,
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

    setWorkspacePreviewRequestForFile(filePath, previewKind = null) {
      if (!filePath) return
      const next = { ...this.workspacePreviewRequests }
      if (previewKind) {
        next[filePath] = previewKind
      } else {
        delete next[filePath]
      }
      this.workspacePreviewRequests = next
    },

    getWorkspacePreviewRequestForFile(filePath) {
      if (!filePath) return null
      const previewKind = this.workspacePreviewRequests[filePath] || null
      if (!previewKind) return null
      const activeSourcePath = this.session.previewSourcePath || this.session.activeFile || ''
      if (this.session.state !== 'workspace-preview' || activeSourcePath !== filePath) {
        return null
      }
      return previewKind
    },

    getSourcePathForPreview(previewPath) {
      const binding = this.getPreviewBinding(previewPath)
      return binding?.sourcePath || previewSourcePathFromPath(previewPath) || (isDocumentWorkflowSource(previewPath) ? previewPath : null)
    },

    findPreviewBindingForSource(sourcePath, previewKind = null) {
      return Object.values(this.previewBindings).find(binding => (
        binding.sourcePath === sourcePath
        && (!previewKind || binding.previewKind === previewKind)
      )) || null
    },

    hasPreviewForSource(sourcePath, previewKind = null) {
      if (!sourcePath) return false
      if (this.findPreviewBindingForSource(sourcePath, previewKind)) return true
      if (
        this.session.previewSourcePath === sourcePath
        && (!previewKind || this.session.previewKind === previewKind)
        && this.session.previewPaneId
      ) {
        return true
      }
      return false
    },

    handlePreviewClosed(previewPath) {
      const effect = resolveDocumentPreviewCloseEffect(previewPath, {
        previewBinding: this.getPreviewBinding(previewPath),
      })
      if (effect.sourcePath && effect.markDetached) {
        this.markDetached(effect.sourcePath)
      }
      this.unbindPreview(previewPath)
    },

    getOpenPreviewPathForSource(sourcePath, previewKind = null) {
      if (!sourcePath) return null
      const binding = this.findPreviewBindingForSource(sourcePath, previewKind)
      if (binding?.previewPath) return binding.previewPath
      if (
        this.session.previewSourcePath === sourcePath
        && this.session.previewPaneId
        && (!previewKind || this.session.previewKind === previewKind)
      ) {
        return this.getPreviewPathForSource(sourcePath, previewKind || this.session.previewKind)
      }
      return null
    },

    getPreviewPathForSource(sourcePath, previewKind = null) {
      const kind = getDocumentWorkflowKind(sourcePath)
      if (!kind) return null
      const resolvedKind = previewKind || this.getPreferredPreviewKind(kind)
      return createWorkflowPreviewPath(sourcePath, kind, resolvedKind)
    },

    closePreviewForSource(sourcePath, options = {}) {
      return this._getDocumentWorkflowRuntime().closePreviewForSource(sourcePath, options)
    },

    async togglePreviewForSource(sourcePath, options = {}) {
      const kind = getDocumentWorkflowKind(sourcePath)
      if (!kind) return null

      const previewKind = options.previewKind || this.getPreferredPreviewKind(kind)
      if (this.hasPreviewForSource(sourcePath, previewKind)) {
        return this.closePreviewForSource(sourcePath, {
          previewKind,
          trigger: options.closeTrigger || options.trigger || 'toggle-preview-close',
          reconcile: options.reconcile,
        })
      }

      if (options.activatePreview === false) {
        return this.ensurePreviewForSource(sourcePath, {
          ...options,
          previewKind,
          trigger: options.openTrigger || options.trigger || 'toggle-preview-open',
        })
      }

      return this.revealPreview(sourcePath, {
        ...options,
        previewKind,
        trigger: options.openTrigger || options.trigger || 'toggle-preview-open',
      })
    },

    setSessionState(payload) {
      this.session = {
        ...this.session,
        ...payload,
      }
    },

    async ensurePreviewForSource(sourcePath, options = {}) {
      return this._getDocumentWorkflowRuntime().ensurePreviewForSource(sourcePath, options)
    },

    async revealPreview(sourcePath, options = {}) {
      return this._getDocumentWorkflowRuntime().revealPreview(sourcePath, options)
    },

    focusProblem(problem) {
      if (!problem?.sourcePath) return
      window.dispatchEvent(new CustomEvent('document-workflow-focus-problem', {
        detail: problem,
      }))
    },

    getAdapterForFile(filePath, options = {}) {
      if (options.workflowOnly === false) {
        return getDocumentAdapterForFile(filePath)
      }
      return getDocumentAdapterForWorkflow(filePath)
    },

    getAdapterCapabilitiesForFile(filePath, options = {}) {
      return getDocumentAdapterCapabilities(filePath, options)
    },

    buildAdapterContext(filePath, options = {}) {
      return this._getDocumentWorkflowBuildRuntime().buildAdapterContext(filePath, options)
    },

    openLogForFile(filePath, options = {}) {
      return this._getDocumentWorkflowBuildRuntime().openLogForFile(filePath, options)
    },

    getProblemsForFile(filePath, options = {}) {
      return this._getDocumentWorkflowBuildRuntime().getProblemsForFile(filePath, options)
    },

    getUiStateForFile(filePath, options = {}) {
      return this._getDocumentWorkflowBuildRuntime().getUiStateForFile(filePath, options)
    },

    getStatusTextForFile(filePath, options = {}) {
      return this._getDocumentWorkflowBuildRuntime().getStatusTextForFile(filePath, options)
    },

    getArtifactPathForFile(filePath, options = {}) {
      return this._getDocumentWorkflowBuildRuntime().getArtifactPathForFile(filePath, options)
    },

    getWorkspacePreviewStateForFile(filePath, options = {}) {
      return this._getDocumentWorkflowBuildRuntime().getWorkspacePreviewStateForFile(filePath, options)
    },

    async showWorkspacePreviewForFile(filePath, options = {}) {
      const kind = getDocumentWorkflowKind(filePath)
      if (!kind) return null
      const previewKind = options.previewKind || this.getPreferredPreviewKind(kind)
      const preferredPreviewKind = this.getPreferredPreviewKind(kind)

      const mutation = await mutateDocumentWorkspacePreview({
        intent: 'show',
        filePath,
        kind,
        previewKind,
        preferredPreviewKind,
        persistPreference: options.persistPreference !== false,
        sourcePaneId: options.sourcePaneId,
        currentSession: this.session,
      })

      if (!mutation || typeof mutation !== 'object') return null

      if (mutation.persistedPreviewKind) {
        this.setPreferredPreviewKind(kind, String(mutation.persistedPreviewKind))
      }
      this.setWorkspacePreviewRequestForFile(
        filePath,
        typeof mutation.requestValue === 'string' ? mutation.requestValue : null,
      )
      if (typeof mutation.visibility === 'string') {
        this.setWorkspacePreviewVisibility(filePath, mutation.visibility)
      }
      if (typeof mutation.clearDetachedSourcePath === 'string' && mutation.clearDetachedSourcePath) {
        this.clearDetached(mutation.clearDetachedSourcePath)
      }
      if (mutation.sessionState && typeof mutation.sessionState === 'object') {
        this.setSessionState(mutation.sessionState)
      }

      return mutation.result || null
    },

    switchWorkspacePreviewModeForFile(filePath, options = {}) {
      return this.showWorkspacePreviewForFile(filePath, options)
    },

    async hideWorkspacePreviewForFile(filePath) {
      const kind = getDocumentWorkflowKind(filePath)
      if (!kind) return null

      const mutation = await mutateDocumentWorkspacePreview({
        intent: 'hide',
        filePath,
        kind,
        currentSession: this.session,
      })

      if (!mutation || typeof mutation !== 'object') return null

      this.setWorkspacePreviewRequestForFile(filePath, null)
      if (typeof mutation.visibility === 'string') {
        this.setWorkspacePreviewVisibility(filePath, mutation.visibility)
      }
      if (mutation.sessionState && typeof mutation.sessionState === 'object') {
        this.setSessionState(mutation.sessionState)
      }

      return mutation.result || null
    },

    runBuildForFile(filePath, options = {}) {
      return this._getDocumentWorkflowBuildOperationRuntime().runBuildForFile(filePath, options)
    },

    toggleWorkflowMarkdownPreviewForFile(filePath, options = {}) {
      return this._getDocumentWorkflowActionRuntime().toggleMarkdownPreviewForFile(filePath, options)
    },

    openWorkflowOutputForFile(filePath, options = {}) {
      return this._getDocumentWorkflowActionRuntime().openWorkflowOutputForFile(filePath, options)
    },

    toggleWorkflowPdfPreviewForFile(filePath, options = {}) {
      return this._getDocumentWorkflowActionRuntime().togglePdfPreviewForFile(filePath, options)
    },

    runWorkflowPrimaryActionForFile(filePath, options = {}) {
      return this._getDocumentWorkflowActionRuntime().runPrimaryActionForFile(filePath, options)
    },

    revealWorkflowPreviewForFile(filePath, options = {}) {
      return this._getDocumentWorkflowActionRuntime().revealPreviewForFile(filePath, options)
    },

    revealWorkflowPdfForFile(filePath, options = {}) {
      return this._getDocumentWorkflowActionRuntime().revealPdfForFile(filePath, options)
    },

    async reconcile(options = {}) {
      return this._getDocumentWorkflowRuntime().reconcile(options)
    },

    cleanup() {
      this.session = {
        activeFile: null,
        activeKind: null,
        sourcePaneId: null,
        previewPaneId: null,
        previewKind: null,
        previewSourcePath: null,
        state: 'inactive',
        detachedSources: {},
      }
      this.previewBindings = {}
      this.markdownPreviewState = {}
      this.workspacePreviewVisibility = {}
      this.workspacePreviewRequests = {}
      this.resolvedWorkspacePreviewStates = {}
      this.resolvedWorkflowUiStates = {}
      this._isReconciling = false
      this._lastTrigger = null
      this._resolvedWorkspacePreviewStateInflight?.clear?.()
      this._resolvedWorkflowUiStateInflight?.clear?.()
    },
  },
})
