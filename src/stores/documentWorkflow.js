import { defineStore } from 'pinia'
import { useEditorStore } from './editor.js'
import { useLatexStore } from './latex.js'
import { useTypstStore } from './typst.js'
import { useFilesStore } from './files.js'
import { useReferencesStore } from './references.js'
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
  getDocumentAdapterByKind,
  listWorkflowDocumentAdapters,
} from '../services/documentWorkflow/adapters/index.js'
import { createDocumentWorkflowRuntime } from '../domains/document/documentWorkflowRuntime.js'
import { createDocumentWorkflowBuildRuntime } from '../domains/document/documentWorkflowBuildRuntime.js'
import { createDocumentWorkflowBuildOperationRuntime } from '../domains/document/documentWorkflowBuildOperationRuntime.js'
import { createDocumentWorkflowActionRuntime } from '../domains/document/documentWorkflowActionRuntime.js'
import { createDocumentWorkflowAiRuntime } from '../domains/document/documentWorkflowAiRuntime.js'
import { createDocumentWorkflowTypstPaneRuntime } from '../domains/document/documentWorkflowTypstPaneRuntime.js'
import {
  findWorkflowPreviewPane,
  reconcileDocumentWorkflow,
} from '../domains/document/documentWorkflowReconcileRuntime.js'
import { resolveDocumentPreviewCloseEffect } from '../domains/document/documentWorkspacePreviewRuntime.js'
import { createDocumentWorkspacePreviewAction as createWorkspacePreviewAction } from '../domains/document/documentWorkspacePreviewRuntime.js'

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
          getPreviewBinding: (previewPath) => this.getPreviewBinding(previewPath),
          inferPreviewKind: (sourcePath, previewPath) => this.inferPreviewKind(sourcePath, previewPath),
          bindPreview: (binding) => this.bindPreview(binding),
          getOpenPreviewPathForSource: (sourcePath, previewKind) => this.getOpenPreviewPathForSource(sourcePath, previewKind),
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
          getDocumentWorkflowKindImpl: getDocumentWorkflowKind,
          createWorkspacePreviewAction,
          getPreferredWorkflowPreviewKind,
          createWorkflowPreviewPath,
          reconcileDocumentWorkflowImpl: reconcileDocumentWorkflow,
          findWorkflowPreviewPaneImpl: findWorkflowPreviewPane,
          jumpPreviewToCursor: ({ kind, previewKind, sourcePath }) => {
            if (kind === 'latex') {
              window.dispatchEvent(new CustomEvent('latex-request-cursor', {
                detail: { texPath: sourcePath },
              }))
              return
            }

            if (kind === 'typst') {
              window.dispatchEvent(new CustomEvent('typst-request-cursor', {
                detail: { sourcePath },
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
          getTypstStore: () => useTypstStore(),
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
          getTypstPaneRuntime: () => createDocumentWorkflowTypstPaneRuntime({
            getEditorStore: () => useEditorStore(),
            getWorkflowStore: () => this,
          }),
        })
      }
      return this._documentWorkflowActionRuntime
    },

    _getDocumentWorkflowAiRuntime() {
      if (!this._documentWorkflowAiRuntime) {
        this._documentWorkflowAiRuntime = createDocumentWorkflowAiRuntime()
      }
      return this._documentWorkflowAiRuntime
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

    togglePreviewForSource(sourcePath, options = {}) {
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

    ensurePreviewForSource(sourcePath, options = {}) {
      return this._getDocumentWorkflowRuntime().ensurePreviewForSource(sourcePath, options)
    },

    revealPreview(sourcePath, options = {}) {
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

    showWorkspacePreviewForFile(filePath, options = {}) {
      const kind = getDocumentWorkflowKind(filePath)
      if (!kind) return null
      const previewKind = options.previewKind || this.getPreferredPreviewKind(kind)
      if (previewKind) {
        this.setPreferredPreviewKind(kind, previewKind)
      }
      this.setWorkspacePreviewVisibility(filePath, 'visible')
      this.clearDetached(filePath)
      return {
        type: 'workspace-preview',
        filePath,
        previewKind,
        legacyReadOnly: false,
      }
    },

    switchWorkspacePreviewModeForFile(filePath, options = {}) {
      return this.showWorkspacePreviewForFile(filePath, options)
    },

    hideWorkspacePreviewForFile(filePath) {
      const kind = getDocumentWorkflowKind(filePath)
      if (!kind) return null
      this.setWorkspacePreviewVisibility(filePath, 'hidden')
      return {
        type: 'workspace-preview-hidden',
        filePath,
        legacyReadOnly: false,
      }
    },

    runBuildForFile(filePath, options = {}) {
      return this._getDocumentWorkflowBuildOperationRuntime().runBuildForFile(filePath, options)
    },

    toggleWorkflowMarkdownPreviewForFile(filePath, options = {}) {
      return this._getDocumentWorkflowActionRuntime().toggleMarkdownPreviewForFile(filePath, options)
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

    launchWorkflowFixWithAiForFile(filePath, options = {}) {
      return this._getDocumentWorkflowAiRuntime().launchFixForFile(filePath, options)
    },

    launchWorkflowDiagnoseWithAiForFile(filePath, options = {}) {
      return this._getDocumentWorkflowAiRuntime().launchDiagnoseForFile(filePath, options)
    },

    reconcile(options = {}) {
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
      this._isReconciling = false
      this._lastTrigger = null
    },
  },
})
