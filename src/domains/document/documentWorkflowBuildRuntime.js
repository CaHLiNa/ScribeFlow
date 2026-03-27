import {
  getDocumentAdapterForFile,
  getDocumentAdapterForWorkflow,
} from '../../services/documentWorkflow/adapters/index.js'
import { resolveDocumentWorkspacePreviewState } from './documentWorkspacePreviewRuntime.js'

function resolveDocumentAdapter(filePath, options = {}) {
  if (options.adapter) return options.adapter
  if (options.workflowOnly === false) {
    return getDocumentAdapterForFile(filePath)
  }
  return getDocumentAdapterForWorkflow(filePath)
}

function resolvePreferredPreviewKind(adapter, options = {}, workflowStore = null) {
  if (!adapter) return null
  if (options.previewKind) return options.previewKind

  const getPreferredPreviewKind = (
    options.getPreferredPreviewKind
    || workflowStore?.getPreferredPreviewKind?.bind(workflowStore)
  )
  return getPreferredPreviewKind?.(adapter.kind) || adapter.preview?.defaultKind || null
}

function resolveRequestedPreviewKind(filePath, adapter, options = {}, workflowStore = null) {
  if (!adapter) return null

  const session = options.session || workflowStore?.session || {}
  const preferredPreviewKind = resolvePreferredPreviewKind(adapter, options, workflowStore)
  if (session.activeFile === filePath) {
    return session.previewKind || preferredPreviewKind
  }
  return preferredPreviewKind
}

function resolvePreviewTargetPath(filePath, adapter, context, options = {}) {
  if (options.resolvedTargetPath || options.previewTargetPath) {
    return options.resolvedTargetPath || options.previewTargetPath || ''
  }
  return adapter?.preview?.getTargetPath?.(filePath, context, options) || ''
}

function resolveNativePreviewSupported(filePath, adapter, context, requestedPreviewKind, options = {}) {
  if (typeof options.nativePreviewSupported === 'boolean') {
    return options.nativePreviewSupported
  }
  if (adapter?.kind !== 'typst') return true
  if (requestedPreviewKind === 'pdf') return false
  return adapter?.preview?.isNativeSupported?.(filePath, context, options) !== false
}

function resolveArtifactReady(filePath, adapter, context) {
  if (!adapter || !filePath) return false
  if (adapter.kind === 'latex') {
    return Boolean(context.latexStore?.stateForFile?.(filePath)?.pdfPath)
  }
  if (adapter.kind === 'typst') {
    return Boolean(context.typstStore?.stateForFile?.(filePath)?.pdfPath)
  }
  return false
}

function resolvePreviewState(filePath, adapter, context, options = {}) {
  if (!adapter) return null

  const requestedPreviewKind = resolveRequestedPreviewKind(filePath, adapter, options, context.workflowStore)
  return resolveDocumentWorkspacePreviewState({
    path: filePath,
    workflowUiState: { kind: adapter.kind, previewKind: requestedPreviewKind },
    previewKind: requestedPreviewKind,
    resolvedTargetPath: resolvePreviewTargetPath(filePath, adapter, context, options),
    nativePreviewSupported: resolveNativePreviewSupported(
      filePath,
      adapter,
      context,
      requestedPreviewKind,
      options,
    ),
    artifactReady: resolveArtifactReady(filePath, adapter, context),
    hasOpenLegacyPreview: options.hasOpenLegacyPreview === true,
    preserveOpenLegacy: options.preserveOpenLegacy === true,
    hiddenByUser: context.workflowStore?.isWorkspacePreviewHiddenForFile?.(filePath) === true,
  })
}

export function getDocumentWorkflowStatusTone(uiState = null) {
  if (!uiState) return 'muted'
  if (uiState.kind === 'markdown') {
    if (uiState.exportPhase === 'exporting' || uiState.phase === 'rendering') return 'running'
    if (uiState.phase === 'error') return 'error'
    if (uiState.exportPhase === 'error') return 'warning'
    if (uiState.phase === 'ready' || uiState.exportPhase === 'ready') return 'success'
    return 'muted'
  }
  if (uiState.phase === 'compiling' || uiState.phase === 'rendering') return 'running'
  if (uiState.phase === 'queued') return 'warning'
  if (uiState.phase === 'error') return 'error'
  if (uiState.phase === 'ready') return 'success'
  return 'muted'
}

export function createDocumentWorkflowBuildRuntime({
  getWorkflowStore,
  getEditorStore,
  getFilesStore,
  getWorkspaceStore,
  getLatexStore,
  getTypstStore,
  getReferencesStore,
} = {}) {
  function resolveBaseContext(options = {}) {
    return {
      workflowStore: getWorkflowStore?.() || null,
      editorStore: options.editorStore || getEditorStore?.() || null,
      filesStore: options.filesStore || getFilesStore?.() || null,
      chatStore: options.chatStore || null,
      workspace: options.workspace || getWorkspaceStore?.() || null,
      latexStore: options.latexStore || getLatexStore?.() || null,
      typstStore: options.typstStore || getTypstStore?.() || null,
      toastStore: options.toastStore || null,
      referencesStore: options.referencesStore || getReferencesStore?.() || null,
      t: options.t || null,
    }
  }

  function buildAdapterContext(filePath, options = {}) {
    const context = resolveBaseContext(options)
    const adapter = resolveDocumentAdapter(filePath, options)
    if (!adapter) {
      return {
        ...context,
        adapter: null,
        previewState: null,
        workspacePreviewState: null,
        previewKind: null,
        previewMode: null,
        previewAvailable: false,
        previewVisible: false,
        previewTargetPath: '',
        targetResolution: null,
      }
    }

    const previewState = resolvePreviewState(filePath, adapter, context, options)
    return {
      ...context,
      adapter,
      previewState,
      workspacePreviewState: previewState,
      previewKind: previewState?.previewKind || null,
      previewMode: previewState?.previewMode || null,
      previewAvailable: previewState?.previewVisible === true,
      previewVisible: previewState?.previewVisible === true,
      previewTargetPath: previewState?.previewTargetPath || '',
      targetResolution: previewState?.targetResolution || null,
    }
  }

  function openLogForFile(filePath, options = {}) {
    const context = buildAdapterContext(filePath, options)
    context.adapter?.compile?.openLog?.(filePath, context)
  }

  function getProblemsForFile(filePath, options = {}) {
    const context = buildAdapterContext(filePath, options)
    return context.adapter?.getProblems?.(filePath, context) || []
  }

  function getUiStateForFile(filePath, options = {}) {
    const context = buildAdapterContext(filePath, options)
    return context.adapter?.getUiState?.(filePath, context) || null
  }

  function getStatusTextForFile(filePath, options = {}) {
    const context = buildAdapterContext(filePath, options)
    return context.adapter?.compile?.getStatusText?.(filePath, context) || ''
  }

  function getArtifactPathForFile(filePath, options = {}) {
    const context = buildAdapterContext(filePath, options)
    return context.adapter?.compile?.getArtifactPath?.(filePath, context) || ''
  }

  function getWorkspacePreviewStateForFile(filePath, options = {}) {
    return buildAdapterContext(filePath, options).workspacePreviewState
  }

  return {
    buildAdapterContext,
    openLogForFile,
    getProblemsForFile,
    getUiStateForFile,
    getStatusTextForFile,
    getArtifactPathForFile,
    getWorkspacePreviewStateForFile,
    getStatusTone: getDocumentWorkflowStatusTone,
  }
}
