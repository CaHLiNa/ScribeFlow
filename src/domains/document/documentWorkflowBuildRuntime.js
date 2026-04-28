import {
  getDocumentAdapterForFile,
  getDocumentAdapterForWorkflow,
} from '../../services/documentWorkflow/adapters/index.js'

function resolveDocumentAdapter(filePath, options = {}) {
  if (options.adapter) return options.adapter
  if (options.workflowOnly === false) {
    return getDocumentAdapterForFile(filePath)
  }
  return getDocumentAdapterForWorkflow(filePath)
}

export function createDocumentWorkflowBuildRuntime({
  getWorkflowStore,
  getEditorStore,
  getFilesStore,
  getWorkspaceStore,
  getLatexStore,
  getPythonStore,
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
      toastStore: options.toastStore || null,
      t: options.t || null,
    }
  }

  function buildWorkflowContextRequest(filePath, adapter, context, options = {}) {
    const workflowStore = context.workflowStore || null
    return {
      filePath,
      previewPrefs: workflowStore?.previewPrefs || {},
      session: workflowStore?.session || {},
      workspacePreviewRequests: workflowStore?.workspacePreviewRequests || {},
      workspacePreviewVisibility: workflowStore?.workspacePreviewVisibility || {},
      markdownState: adapter.kind === 'markdown'
        ? workflowStore?.markdownPreviewState?.[filePath] || {}
        : null,
      markdownDraftProblems: null,
      latexState: adapter.kind === 'latex'
        ? context.latexStore?.stateForFile?.(filePath) || {}
        : null,
      latexLintDiagnostics: adapter.kind === 'latex'
        ? context.latexStore?.lintDiagnosticsForFile?.(filePath) || []
        : null,
      workspacePath: adapter.kind === 'latex'
        ? context.workspace?.path || ''
        : '',
      sourceContent: adapter.kind === 'markdown' || adapter.kind === 'latex'
        ? context.filesStore?.fileContents?.[filePath] || ''
        : '',
      sourceRevision: adapter.kind === 'markdown' || adapter.kind === 'latex'
        ? Number(context.filesStore?.fileContentRevisions?.[filePath] || 0)
        : 0,
      pythonState: adapter.kind === 'python'
        ? context.pythonStore?.stateForFile?.(filePath) || {}
        : null,
      queueState: adapter.kind === 'latex'
        ? context.latexStore?.queueStateForFile?.(filePath) || {}
        : null,
      persistedArtifactPath: adapter.kind === 'latex'
        ? workflowStore?.getLatexArtifactPathForFile?.(filePath) || ''
        : '',
      nativePreviewSupported: options.nativePreviewSupported !== false,
    }
  }

  function resolveWorkflowContext(filePath, adapter, context, options = {}) {
    if (!adapter) return null
    const request = buildWorkflowContextRequest(filePath, adapter, context, options)
    return context.workflowStore?.ensureResolvedWorkflowContext?.(filePath, request) || null
  }

  function buildAdapterContext(filePath, options = {}) {
    const context = resolveBaseContext(options)
    const adapter = resolveDocumentAdapter(filePath, options)
    if (!adapter) {
      return {
        ...context,
        adapter: null,
        workflowState: null,
        workflowUiState: null,
        previewState: null,
        workspacePreviewState: null,
        previewKind: null,
        previewMode: null,
        previewAvailable: false,
        previewVisible: false,
        previewTargetPath: '',
        targetResolution: null,
        artifactPath: '',
        artifactReady: false,
        nativePreviewSupported: true,
        statusText: '',
        statusTone: 'muted',
      }
    }

    const resolved = resolveWorkflowContext(filePath, adapter, context, options)
    const workflowState = resolved?.workflowState || null
    const previewState = resolved?.previewState || null
    const workflowUiState = resolved?.workflowUiState || workflowState?.uiState || null
    const artifactPath = String(
      resolved?.artifactPath ||
      workflowState?.artifactPath ||
      '',
    )

    return {
      ...context,
      adapter,
      workflowState,
      workflowUiState,
      previewState,
      workspacePreviewState: previewState,
      previewKind: resolved?.previewKind ?? previewState?.previewKind ?? null,
      previewMode: resolved?.previewMode ?? previewState?.previewMode ?? null,
      previewAvailable: resolved?.previewAvailable === true,
      previewVisible: resolved?.previewVisible === true,
      previewTargetPath: resolved?.previewTargetPath || previewState?.previewTargetPath || '',
      targetResolution: resolved?.targetResolution ?? previewState?.targetResolution ?? null,
      artifactPath,
      artifactReady: !!artifactPath,
      nativePreviewSupported: resolved?.nativePreviewSupported !== false,
      statusText: String(resolved?.statusText || ''),
      statusTone: String(resolved?.statusTone || 'muted'),
    }
  }

  function openLogForFile(filePath, options = {}) {
    const context = buildAdapterContext(filePath, options)
    context.adapter?.compile?.openLog?.(filePath, context)
  }

  function getProblemsForFile(filePath, options = {}) {
    const context = buildAdapterContext(filePath, options)
    return context.workflowState?.problems || []
  }

  function getArtifactPathForFile(filePath, options = {}) {
    return buildAdapterContext(filePath, options).artifactPath || ''
  }

  function getWorkspacePreviewStateForFile(filePath, options = {}) {
    return buildAdapterContext(filePath, options).workspacePreviewState
  }

  return {
    buildAdapterContext,
    openLogForFile,
    getProblemsForFile,
    getArtifactPathForFile,
    getWorkspacePreviewStateForFile,
  }
}
