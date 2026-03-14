import { defineStore } from 'pinia'
import { useEditorStore } from './editor.js'
import { useLatexStore } from './latex.js'
import { useTypstStore } from './typst.js'
import {
  createWorkflowPreviewPath,
  getDocumentWorkflowKind,
  getPreferredWorkflowPreviewKind,
  inferWorkflowPreviewKind,
  isDocumentWorkflowSource,
} from '../services/documentWorkflow/policy.js'
import {
  findWorkflowPreviewPane,
  reconcileDocumentWorkflow,
} from '../services/documentWorkflow/reconcile.js'
import {
  buildMarkdownWorkflowProblems,
  buildMarkdownWorkflowUiState,
} from '../services/documentWorkflow/adapters/markdown.js'
import {
  buildLatexWorkflowProblems,
  buildLatexWorkflowUiState,
} from '../services/documentWorkflow/adapters/latex.js'
import {
  buildTypstWorkflowProblems,
  buildTypstWorkflowUiState,
} from '../services/documentWorkflow/adapters/typst.js'

const PREFS_KEY = 'documentWorkflow.previewPrefs'

function defaultPrefs() {
  return {
    markdown: { preferredPreview: 'html' },
    latex: { preferredPreview: 'pdf' },
    typst: { preferredPreview: 'pdf' },
  }
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
    markdownPdfState: {},
    _isReconciling: false,
    _lastTrigger: null,
  }),

  getters: {
    isWorkflowSource: () => (filePath) => isDocumentWorkflowSource(filePath),
  },

  actions: {
    persistPrefs() {
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(this.previewPrefs))
      } catch {}
    },

    getPreferredPreviewKind(kind) {
      return getPreferredWorkflowPreviewKind(kind, this.previewPrefs)
    },

    setPreferredPreviewKind(kind, previewKind) {
      if (!kind || !previewKind) return
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

    bindPreview({ previewPath, sourcePath, previewKind, kind, paneId = null }) {
      if (!previewPath || !sourcePath) return
      this.previewBindings = {
        ...this.previewBindings,
        [previewPath]: {
          previewPath,
          sourcePath,
          previewKind,
          kind,
          paneId,
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

    setMarkdownPdfState(sourcePath, state) {
      if (!sourcePath) return
      this.markdownPdfState = {
        ...this.markdownPdfState,
        [sourcePath]: {
          ...(this.markdownPdfState[sourcePath] || {}),
          ...state,
        },
      }
    },

    clearMarkdownStates(sourcePath) {
      if (!sourcePath) return
      const nextPreview = { ...this.markdownPreviewState }
      const nextPdf = { ...this.markdownPdfState }
      delete nextPreview[sourcePath]
      delete nextPdf[sourcePath]
      this.markdownPreviewState = nextPreview
      this.markdownPdfState = nextPdf
    },

    getSourcePathForPreview(previewPath) {
      const binding = this.getPreviewBinding(previewPath)
      return binding?.sourcePath || null
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
      const sourcePath = this.getSourcePathForPreview(previewPath)
      if (sourcePath) {
        this.markDetached(sourcePath)
        this.unbindPreview(previewPath)
      }
    },

    getPreviewPathForSource(sourcePath, previewKind = null) {
      const kind = getDocumentWorkflowKind(sourcePath)
      if (!kind) return null
      const resolvedKind = previewKind || this.getPreferredPreviewKind(kind)
      return createWorkflowPreviewPath(sourcePath, kind, resolvedKind)
    },

    setSessionState(payload) {
      this.session = {
        ...this.session,
        ...payload,
      }
    },

    ensurePreviewForSource(sourcePath, options = {}) {
      const editorStore = useEditorStore()
      const kind = getDocumentWorkflowKind(sourcePath)
      if (!kind) return null
      const previewKind = options.previewKind || this.getPreferredPreviewKind(kind)
      this.clearDetached(sourcePath)
      const previousActivePaneId = editorStore.activePaneId
      const previousActiveTab = editorStore.activeTab
      editorStore.activePaneId = options.sourcePaneId || editorStore.activePaneId
      const result = this.reconcile({
        trigger: options.trigger || 'manual-open-preview',
        force: true,
        previewKindOverride: previewKind,
      })
      if (!options.activatePreview) {
        editorStore.activePaneId = previousActivePaneId
        if (previousActiveTab && previousActivePaneId) {
          editorStore.setActiveTab(previousActivePaneId, previousActiveTab)
        }
      } else if (result?.previewPaneId && result.previewPath) {
        editorStore.openFileInPane(result.previewPath, result.previewPaneId, { activatePane: true })
      }
      return result
    },

    revealPreview(sourcePath, options = {}) {
      const result = this.ensurePreviewForSource(sourcePath, {
        force: true,
        activatePreview: true,
        previewKind: options.previewKind,
        sourcePaneId: options.sourcePaneId,
        trigger: options.trigger || 'reveal-preview',
      })

      if (!result?.previewPaneId || !result?.previewPath) return result

      const editorStore = useEditorStore()
      editorStore.openFileInPane(result.previewPath, result.previewPaneId, { activatePane: true })

      if (options.jump && result.kind === 'latex') {
        window.dispatchEvent(new CustomEvent('latex-request-cursor', {
          detail: { texPath: sourcePath },
        }))
      }

      return result
    },

    focusProblem(problem) {
      if (!problem?.sourcePath) return
      window.dispatchEvent(new CustomEvent('document-workflow-focus-problem', {
        detail: problem,
      }))
    },

    openLogForFile(filePath) {
      const kind = getDocumentWorkflowKind(filePath)
      if (kind === 'latex') {
        useLatexStore().openCompileLog(filePath)
      } else if (kind === 'typst') {
        useTypstStore().openCompileLog(filePath)
      }
    },

    getProblemsForFile(filePath) {
      const kind = getDocumentWorkflowKind(filePath)
      if (!kind) return []

      if (kind === 'markdown') {
        const previewKind = this.session.activeFile === filePath
          ? (this.session.previewKind || this.getPreferredPreviewKind(kind))
          : this.getPreferredPreviewKind(kind)
        const state = previewKind === 'pdf'
          ? this.markdownPdfState[filePath]
          : this.markdownPreviewState[filePath]
        return buildMarkdownWorkflowProblems(filePath, state)
      }

      if (kind === 'latex') {
        return buildLatexWorkflowProblems(filePath, useLatexStore().stateForFile(filePath))
      }

      if (kind === 'typst') {
        return buildTypstWorkflowProblems(filePath, useTypstStore().stateForFile(filePath))
      }

      return []
    },

    getUiStateForFile(filePath) {
      const kind = getDocumentWorkflowKind(filePath)
      if (!kind) return null

      const previewKind = this.session.activeFile === filePath
        ? (this.session.previewKind || this.getPreferredPreviewKind(kind))
        : this.getPreferredPreviewKind(kind)
      const previewAvailable = this.hasPreviewForSource(filePath, previewKind)

      if (kind === 'markdown') {
        return buildMarkdownWorkflowUiState({
          previewKind,
          previewAvailable,
          htmlState: this.markdownPreviewState[filePath] || {},
          pdfState: this.markdownPdfState[filePath] || {},
        })
      }

      if (kind === 'latex') {
        return buildLatexWorkflowUiState(
          useLatexStore().stateForFile(filePath) || {},
          { previewAvailable },
        )
      }

      if (kind === 'typst') {
        return buildTypstWorkflowUiState(
          useTypstStore().stateForFile(filePath) || {},
          { previewAvailable },
        )
      }

      return null
    },

    reconcile(options = {}) {
      if (this._isReconciling) return null
      const editorStore = useEditorStore()
      this._isReconciling = true
      try {
        const result = reconcileDocumentWorkflow({
          activeFile: editorStore.activeTab,
          activePaneId: editorStore.activePaneId,
          paneTree: editorStore.paneTree,
          trigger: options.trigger || 'manual',
          workflowStore: this,
          force: options.force === true,
          previewKindOverride: options.previewKindOverride || null,
        })
        this._lastTrigger = result?.trigger || options.trigger || 'manual'

        if (!result || result.type === 'inactive') {
          this.setSessionState({
            activeFile: null,
            activeKind: null,
            sourcePaneId: editorStore.activePaneId,
            previewPaneId: null,
            previewKind: null,
            previewSourcePath: null,
            state: 'inactive',
          })
          return result
        }

        if (result.type === 'detached') {
          this.setSessionState({
            activeFile: result.sourcePath,
            activeKind: result.kind,
            sourcePaneId: result.sourcePaneId,
            previewPaneId: null,
            previewKind: result.previewKind,
            previewSourcePath: result.sourcePath,
            state: 'detached-by-user',
          })
          return result
        }

        let previewPaneId = result.previewPaneId
        let previewPath = result.previewPath

        if (result.type === 'open-neighbor' && previewPaneId && previewPath) {
          editorStore.openFileInPane(previewPath, previewPaneId, { activatePane: false })
        } else if (result.type === 'split-right' && previewPath) {
          previewPaneId = editorStore.splitPaneWith(result.sourcePaneId, 'vertical', previewPath)
        } else if (result.type === 'ready-existing' && previewPaneId && previewPath && options.force) {
          editorStore.openFileInPane(previewPath, previewPaneId, { activatePane: false })
        }

        if (previewPath) {
          const previewLeaf = findWorkflowPreviewPane(editorStore.paneTree, previewPath)
          if (previewLeaf?.id) {
            previewPaneId = previewLeaf.id
          }
          this.bindPreview({
            previewPath,
            sourcePath: result.sourcePath,
            previewKind: result.previewKind,
            kind: result.kind,
            paneId: previewPaneId,
          })
        }

        this.setSessionState({
          activeFile: result.sourcePath,
          activeKind: result.kind,
          sourcePaneId: result.sourcePaneId,
          previewPaneId: previewPaneId || null,
          previewKind: result.previewKind,
          previewSourcePath: result.sourcePath,
          state: previewPaneId ? 'ready' : result.state,
        })

        return {
          ...result,
          previewPaneId: previewPaneId || null,
          previewPath,
        }
      } finally {
        this._isReconciling = false
      }
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
      this.markdownPdfState = {}
      this._isReconciling = false
      this._lastTrigger = null
    },
  },
})
