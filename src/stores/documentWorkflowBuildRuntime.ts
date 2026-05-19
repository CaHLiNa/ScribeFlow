import {
  getDocumentAdapterForFile,
  getDocumentAdapterForWorkflow,
} from '../services/documentWorkflow/adapters/index.ts'
import {
  buildPreviewStateRequest,
  buildWorkflowUiStateRequest,
} from '../domains/document/documentWorkflowBuildStateRequests.ts'

function getDocumentWorkflowStatusTone(uiState = null) {
  return uiState?.statusTone || 'muted'
}

function resolveDocumentAdapter(filePath, options = {}) {
  if (options.adapter) return options.adapter
  if (options.workflowOnly === false) {
    return getDocumentAdapterForFile(filePath)
  }
  return getDocumentAdapterForWorkflow(filePath)
}

function resolvePreviewState(filePath, adapter, context, options = {}) {
  if (!adapter) return null

  const request = buildPreviewStateRequest(filePath, adapter, context, options)
  return context.workflowStore?.ensureResolvedWorkspacePreviewState?.(filePath, request) || null
}

function resolveWorkflowUiState(filePath, adapter, context, options = {}, previewState = null) {
  if (!adapter) return null
  const request = buildWorkflowUiStateRequest(filePath, adapter, context, options, previewState)
  return context.workflowStore?.ensureResolvedWorkflowUiState?.(filePath, request) || null
}

export function createDocumentWorkflowBuildRuntime({
  getWorkflowStore,
  getEditorStore,
  getFilesStore,
  getWorkspaceStore,
  getLatexStore,
  getPythonStore,
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
      pythonStore: options.pythonStore || getPythonStore?.() || null,
      referencesStore: options.referencesStore || getReferencesStore?.() || null,
      toastStore: options.toastStore || null,
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
    const uiState = resolveWorkflowUiState(filePath, adapter, context, options, previewState)
    return {
      ...context,
      adapter,
      workflowUiState: uiState,
      previewState,
      workspacePreviewState: previewState,
      previewKind: uiState?.previewKind || previewState?.previewKind || null,
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
    return buildAdapterContext(filePath, options).workflowUiState || null
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
