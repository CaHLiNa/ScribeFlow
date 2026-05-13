import { defineStore } from 'pinia'
import { useEditorStore } from './editor.js'
import { useLatexStore } from './latex.js'
import { useFilesStore } from './files.js'
import { usePythonStore } from './python.js'
import { useReferencesStore } from './references.js'
import { useWorkspaceStore } from './workspace.js'
import {
  getDocumentWorkflowKind,
  getPreferredWorkflowPreviewKind,
  isDocumentWorkflowSource,
} from '../domains/document/documentWorkflowPolicy.js'
import { getDocumentAdapterByKind } from '../services/documentWorkflow/adapters/index.js'
import { createDocumentWorkflowRuntime } from './documentWorkflowRuntime.js'
import { createDocumentWorkflowBuildRuntime } from './documentWorkflowBuildRuntime.js'
import { createDocumentWorkflowBuildOperationRuntime } from './documentWorkflowBuildOperationRuntime.js'
import { createDocumentWorkflowActionRuntime } from './documentWorkflowActionRuntime.js'
import {
  createDefaultDocumentWorkflowPersistentState,
  createDefaultDocumentWorkflowPreviewPrefs,
  createDefaultDocumentWorkflowSession,
  documentWorkflowSessionActions,
} from './documentWorkflowSessionRuntime.js'
import { documentWorkflowResolvedStateActions } from './documentWorkflowResolvedStateActions.js'
import { openLocalPath } from '../services/localFileOpen.js'
import { applyDocumentWorkspacePreviewState } from '../services/documentWorkflow/workspacePreviewBridge.js'

function normalizeDocumentWorkflowPath(value = '') {
  return String(value || '').trim().replace(/\\/g, '/')
}

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
    resolvedMarkdownDraftProblems: {},
    resolvedLatexProblems: {},
    resolvedPythonProblems: {},
    resolvedWorkspacePreviewStates: {},
    resolvedWorkflowUiStates: {},
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
          getReferencesStore: () => useReferencesStore(),
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
      this.queuePersistentStateSave()
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

    applyOptimisticWorkspacePreviewForFile(filePath, {
      kind = '',
      previewKind = '',
      preferredPreviewKind = '',
      sourcePaneId = '',
      persistPreference = true,
    } = {}) {
      const normalizedPath = normalizeDocumentWorkflowPath(filePath)
      const normalizedKind = String(kind || '').trim()
      const normalizedPreviewKind = String(previewKind || '').trim()
      if (!normalizedPath || !normalizedKind || !normalizedPreviewKind) return
      if (normalizedKind !== 'latex' || normalizedPreviewKind !== 'pdf') return

      const nextPreviewPrefs = persistPreference === false
        ? this.previewPrefs
        : {
            ...this.previewPrefs,
            [normalizedKind]: {
              preferredPreview: normalizedPreviewKind,
            },
          }
      const nextWorkspacePreviewRequests = { ...(this.workspacePreviewRequests || {}) }
      if (normalizedPreviewKind === String(preferredPreviewKind || '').trim()) {
        delete nextWorkspacePreviewRequests[normalizedPath]
      } else {
        nextWorkspacePreviewRequests[normalizedPath] = normalizedPreviewKind
      }

      const nextWorkspacePreviewVisibility = {
        ...(this.workspacePreviewVisibility || {}),
        [normalizedPath]: 'visible',
      }
      const nextDetachedSources = { ...(this.session?.detachedSources || {}) }
      delete nextDetachedSources[normalizedPath]

      this.previewPrefs = nextPreviewPrefs
      this.workspacePreviewRequests = nextWorkspacePreviewRequests
      this.workspacePreviewVisibility = nextWorkspacePreviewVisibility
      this.session = {
        ...this.session,
        activeFile: normalizedPath,
        activeKind: normalizedKind,
        sourcePaneId: sourcePaneId ? normalizeDocumentWorkflowPath(sourcePaneId) : this.session.sourcePaneId,
        previewPaneId: '',
        previewKind: normalizedPreviewKind,
        previewSourcePath: normalizedPath,
        state: 'workspace-preview',
        detachedSources: nextDetachedSources,
      }

      const artifactPath = normalizeDocumentWorkflowPath(this.getArtifactPathForFile(normalizedPath, {
        workflowOnly: false,
      }))
      if (!artifactPath) return

      const request = {
        path: normalizedPath,
        sourcePath: '',
        workflowKind: normalizedKind,
        previewKind: '',
        workspacePreviewRequest: '',
        resolvedTargetPath: artifactPath,
        artifactPath,
        previewRequested: false,
        hiddenByUser: false,
        state: this.snapshotPersistentState(),
      }

      this.setResolvedWorkspacePreviewState(normalizedPath, request, {
        useWorkspace: true,
        previewVisible: true,
        previewKind: normalizedPreviewKind,
        previewMode: 'pdf-artifact',
        targetResolution: 'resolved',
        reason: 'workspace-latex-pdf',
        allowPreviewCreation: true,
        sourcePath: normalizedPath,
        previewTargetPath: artifactPath,
        previewFilePath: artifactPath,
      })
    },

    async showWorkspacePreviewForFile(filePath, options = {}) {
      const kind = getDocumentWorkflowKind(filePath)
      if (!kind) return null
      const previewKind = options.previewKind || this.getPreferredPreviewKind(kind)
      const preferredPreviewKind = this.getPreferredPreviewKind(kind)

      this.applyOptimisticWorkspacePreviewForFile(filePath, {
        kind,
        previewKind,
        preferredPreviewKind,
        sourcePaneId: options.sourcePaneId,
        persistPreference: options.persistPreference !== false,
      })

      const mutation = await applyDocumentWorkspacePreviewState({
        state: this.snapshotPersistentState(),
        intent: 'show',
        filePath,
        kind,
        previewKind,
        preferredPreviewKind,
        persistPreference: options.persistPreference !== false,
        sourcePaneId: options.sourcePaneId,
      })

      if (!mutation || typeof mutation !== 'object') return null
      if (mutation.state && typeof mutation.state === 'object') {
        this.applyPersistentState(mutation.state)
        this.queuePersistentStateSave()
      }

      return mutation.result || null
    },

    async hideWorkspacePreviewForFile(filePath) {
      const kind = getDocumentWorkflowKind(filePath)
      if (!kind) return null

      const mutation = await applyDocumentWorkspacePreviewState({
        state: this.snapshotPersistentState(),
        intent: 'hide',
        filePath,
        kind,
      })

      if (!mutation || typeof mutation !== 'object') return null
      if (mutation.state && typeof mutation.state === 'object') {
        this.applyPersistentState(mutation.state)
        this.queuePersistentStateSave()
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
      await this.reconcileLatexPreviewStates()
      this._persistentStateHydrated = true
      return this.snapshotPersistentState()
    },

    cleanup() {
      clearTimeout(this._persistentStateSaveTimer)
      this._persistentStateSaveTimer = null
      this._persistentStateSaveRevision = 0
      this.applyPersistentState(createDefaultDocumentWorkflowPersistentState())
      this.markdownPreviewState = {}
      this.resolvedMarkdownDraftProblems = {}
      this.resolvedWorkspacePreviewStates = {}
      this.resolvedWorkflowUiStates = {}
      this._isReconciling = false
      this._lastTrigger = null
      this._persistentStateHydrated = false
      this._resolvedMarkdownDraftProblemsInflight?.clear?.()
      this._resolvedWorkspacePreviewStateInflight?.clear?.()
      this._resolvedWorkflowUiStateInflight?.clear?.()
    },
  },
})
