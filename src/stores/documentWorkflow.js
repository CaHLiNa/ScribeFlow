import { defineStore } from 'pinia'
import { useEditorStore } from './editor.js'
import { useLatexStore } from './latex.js'
import { useFilesStore } from './files.js'
import { usePythonStore } from './python.js'
import { useWorkspaceStore } from './workspace.js'
import {
  getDocumentWorkflowKind,
  getPreferredWorkflowPreviewKind,
  isDocumentWorkflowSource,
} from '../services/documentWorkflow/policy.js'
import { getDocumentAdapterByKind } from '../services/documentWorkflow/adapters/index.js'
import { createDocumentWorkflowRuntime } from '../domains/document/documentWorkflowRuntime.js'
import { createDocumentWorkflowBuildRuntime } from '../domains/document/documentWorkflowBuildRuntime.js'
import { createDocumentWorkflowBuildOperationRuntime } from '../domains/document/documentWorkflowBuildOperationRuntime.js'
import { createDocumentWorkflowActionRuntime } from '../domains/document/documentWorkflowActionRuntime.js'
import {
  createDefaultDocumentWorkflowPersistentState,
  createDefaultDocumentWorkflowPreviewPrefs,
  createDefaultDocumentWorkflowSession,
  documentWorkflowSessionActions,
} from '../domains/document/documentWorkflowSessionRuntime.js'
import { documentWorkflowResolvedStateActions } from '../domains/document/documentWorkflowResolvedStateRuntime.js'
import { openLocalPath } from '../services/localFileOpen.js'
import { mutateDocumentWorkspacePreview } from '../services/documentWorkflow/workspacePreviewBridge.js'

export const useDocumentWorkflowStore = defineStore('documentWorkflow', {
  state: () => ({
    previewPrefs: createDefaultDocumentWorkflowPreviewPrefs(),
    session: createDefaultDocumentWorkflowSession(),
    previewBindings: {},
    markdownPreviewState: {},
    workspacePreviewVisibility: {},
    workspacePreviewRequests: {},
    latexArtifactPaths: {},
    latexPreviewStates: {},
    resolvedWorkflowContexts: {},
    _isReconciling: false,
    _lastTrigger: null,
    _persistentStateHydrated: false,
  }),

  getters: {
    isWorkflowSource: () => (filePath) => isDocumentWorkflowSource(filePath),
  },

  actions: {
    ...documentWorkflowSessionActions,
    ...documentWorkflowResolvedStateActions,

    _getWorkspaceStore() {
      return useWorkspaceStore()
    },

    _getDocumentWorkflowRuntime() {
      if (!this._documentWorkflowRuntime) {
        this._documentWorkflowRuntime = createDocumentWorkflowRuntime({
          getSession: () => this.session,
          getPreviewPrefs: () => this.previewPrefs,
          getPreviewBindings: () => this.previewBindings,
          bindPreview: (binding) => this.bindPreview(binding),
          unbindPreview: (previewPath) => this.unbindPreview(previewPath),
          getPreferredPreviewKind: (kind) => this.getPreferredPreviewKind(kind),
          clearDetached: (sourcePath) => this.clearDetached(sourcePath),
          markDetached: (sourcePath) => this.markDetached(sourcePath),
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
          getPythonStore: () => usePythonStore(),
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

    getPreferredPreviewKind(kind) {
      return getPreferredWorkflowPreviewKind(kind, this.previewPrefs)
    },

    async setPreferredPreviewKind(kind, previewKind) {
      if (!kind || !previewKind) return
      const adapter = getDocumentAdapterByKind(kind)
      if (!adapter?.preview?.supportedKinds?.includes(previewKind)) return
      this.previewPrefs = {
        ...this.previewPrefs,
        [kind]: {
          preferredPreview: previewKind,
        },
      }
      const state = await this.persistPreviewPreference(kind, previewKind)
      if (state?.previewPrefs) {
        this.previewPrefs = state.previewPrefs
      }
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

    buildAdapterContext(filePath, options = {}) {
      return this._getDocumentWorkflowBuildRuntime().buildAdapterContext(filePath, options)
    },

    openLogForFile(filePath, options = {}) {
      return this._getDocumentWorkflowBuildRuntime().openLogForFile(filePath, options)
    },

    getProblemsForFile(filePath, options = {}) {
      return this._getDocumentWorkflowBuildRuntime().getProblemsForFile(filePath, options)
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
        await this.setPreferredPreviewKind(kind, String(mutation.persistedPreviewKind))
      }
      await this.setWorkspacePreviewRequestForFile(
        filePath,
        typeof mutation.requestValue === 'string' ? mutation.requestValue : null,
      )
      if (typeof mutation.visibility === 'string') {
        await this.setWorkspacePreviewVisibility(filePath, mutation.visibility)
      }
      if (typeof mutation.clearDetachedSourcePath === 'string' && mutation.clearDetachedSourcePath) {
        await this.clearDetached(mutation.clearDetachedSourcePath)
      }
      if (mutation.sessionState && typeof mutation.sessionState === 'object') {
        await this.setSessionState(mutation.sessionState)
      }

      return mutation.result || null
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

      await this.setWorkspacePreviewRequestForFile(filePath, null)
      if (typeof mutation.visibility === 'string') {
        await this.setWorkspacePreviewVisibility(filePath, mutation.visibility)
      }
      if (mutation.sessionState && typeof mutation.sessionState === 'object') {
        await this.setSessionState(mutation.sessionState)
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

    async applyHydratedPersistentState(state = {}) {
      this.ensureLatexArtifactPersistenceListener()
      this.applyPersistentState(state)
      this._persistentStateHydrated = true
      return this.snapshotPersistentState()
    },

    cleanup() {
      this.applyPersistentState(createDefaultDocumentWorkflowPersistentState())
      this.markdownPreviewState = {}
      this.resolvedWorkflowContexts = {}
      this._isReconciling = false
      this._lastTrigger = null
      this._persistentStateHydrated = false
      this._resolvedWorkflowContextInflight?.clear?.()
    },
  },
})
