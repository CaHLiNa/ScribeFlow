import {
  isLatex,
  isMarkdown,
  isMarkdownPreviewPath,
  isTypst,
  isTypstPreviewPath,
  previewSourcePathFromPath,
} from '../../utils/fileTypes.js'

function getWorkspaceDocumentKind(path = '', workflowUiState = null) {
  if (workflowUiState?.kind && workflowUiState.kind !== 'text') return workflowUiState.kind
  if (!path || typeof path !== 'string') return null
  if (isMarkdown(path)) return 'markdown'
  if (isLatex(path)) return 'latex'
  if (isTypst(path)) return 'typst'
  return null
}

function normalizeTargetResolution(value, fallback = null) {
  if (typeof value === 'string' && value) return value
  if (value && typeof value === 'object' && typeof value.status === 'string' && value.status) {
    return value.status
  }
  return fallback
}

function createPreviewState(overrides = {}) {
  return {
    useWorkspace: false,
    previewVisible: false,
    previewKind: null,
    previewMode: null,
    targetResolution: null,
    reason: 'unsupported-file',
    legacyReadOnly: false,
    allowPreviewCreation: false,
    preserveOpenLegacy: false,
    sourcePath: '',
    previewTargetPath: '',
    previewFilePath: '',
    ...overrides,
  }
}

function hidePreviewState(state, reason = 'hidden-by-user') {
  return {
    ...state,
    previewVisible: false,
    previewMode: null,
    previewFilePath: '',
    reason,
  }
}

function resolveLegacyPreviewState(path, options = {}) {
  const sourcePath = options.sourcePath || previewSourcePathFromPath(path) || ''
  const previewMode = isMarkdownPreviewPath(path) ? 'markdown' : 'typst-native'
  return createPreviewState({
    useWorkspace: false,
    previewVisible: true,
    previewKind: isMarkdownPreviewPath(path) ? 'html' : 'native',
    previewMode,
    targetResolution: 'legacy',
    reason: 'legacy-preview-tab',
    legacyReadOnly: true,
    allowPreviewCreation: false,
    preserveOpenLegacy: true,
    sourcePath,
    previewFilePath: path,
  })
}

function resolvePreviewTargetPath(options = {}) {
  return options.resolvedTargetPath || options.previewTargetPath || options.artifactPath || ''
}

function resolvePreviewMode(previewKind) {
  if (previewKind === 'html') return 'markdown'
  if (previewKind === 'native') return 'typst-native'
  if (previewKind === 'pdf') return 'pdf'
  return null
}

export function shouldUseDocumentWorkspaceTab(path = '') {
  return getWorkspaceDocumentKind(path) !== null
}

export function shouldShowPdfToolbarTarget(viewerType, documentPreviewState = null) {
  if (viewerType === 'pdf') return true
  return (
    documentPreviewState?.useWorkspace === true
    && documentPreviewState?.previewVisible === true
    && documentPreviewState?.previewMode === 'pdf'
  )
}

export function resolveDocumentWorkspaceTextRoute(options = {}) {
  const activeTab = options.activeTab || ''
  const viewerType = options.viewerType || null
  const documentPreviewState = options.documentPreviewState || null
  const useWorkspaceSurface = viewerType === 'text' && shouldUseDocumentWorkspaceTab(activeTab)

  return {
    useWorkspaceSurface,
    previewVisible: useWorkspaceSurface && documentPreviewState?.previewVisible === true,
    previewMode: useWorkspaceSurface ? documentPreviewState?.previewMode || null : null,
    previewTargetPath: useWorkspaceSurface ? documentPreviewState?.previewTargetPath || '' : '',
    previewFilePath: useWorkspaceSurface ? documentPreviewState?.previewFilePath || '' : '',
    toolbarTargetVisible: shouldShowPdfToolbarTarget(viewerType, documentPreviewState),
  }
}

export function createDocumentWorkspacePreviewAction(options = {}) {
  const previewState = options.previewState || resolveDocumentWorkspacePreviewState(options)
  if (!previewState?.useWorkspace || !previewState?.sourcePath || !previewState?.previewKind) {
    return null
  }

  return {
    type: 'workspace-preview',
    kind: getWorkspaceDocumentKind(previewState.sourcePath),
    filePath: previewState.sourcePath,
    sourcePath: previewState.sourcePath,
    sourcePaneId: options.sourcePaneId || null,
    previewKind: previewState.previewKind,
    previewMode: previewState.previewMode || resolvePreviewMode(previewState.previewKind),
    previewTargetPath: previewState.previewTargetPath || '',
    targetResolution: previewState.targetResolution || null,
    trigger: options.trigger || 'workspace-preview',
    state: 'workspace-preview',
    preserveOpenLegacy: previewState.preserveOpenLegacy === true,
    legacyReadOnly: previewState.legacyReadOnly === true,
    legacyPreviewPath: options.legacyPreviewPath || '',
    legacyPreviewPaneId: options.legacyPreviewPaneId || null,
  }
}

export function resolveDocumentPreviewCloseEffect(previewPath, options = {}) {
  const sourcePath = options.previewBinding?.sourcePath || previewSourcePathFromPath(previewPath) || null
  return {
    sourcePath,
    markDetached: options.previewBinding?.detachOnClose === true,
  }
}

export function resolveDocumentWorkspacePreviewState(options = {}) {
  const path = String(options.path || options.filePath || options.sourcePath || '')
  if (isMarkdownPreviewPath(path) || isTypstPreviewPath(path)) {
    return resolveLegacyPreviewState(path, options)
  }

  const workflowUiState = options.workflowUiState || null
  const documentKind = getWorkspaceDocumentKind(path, workflowUiState)
  const preserveOpenLegacy = options.preserveOpenLegacy === true || options.hasOpenLegacyPreview === true
  const requestedPreviewKind = options.previewKind || workflowUiState?.previewKind || null
  const previewTargetPath = resolvePreviewTargetPath(options)
  const hiddenByUser = options.hiddenByUser === true
  const artifactReady = options.artifactReady === true || !!previewTargetPath

  if (documentKind === 'markdown') {
    const state = createPreviewState({
      useWorkspace: true,
      previewVisible: true,
      previewKind: 'html',
      previewMode: 'markdown',
      targetResolution: 'not-needed',
      reason: 'workspace-markdown',
      legacyReadOnly: false,
      allowPreviewCreation: true,
      preserveOpenLegacy,
      sourcePath: path,
      previewFilePath: `preview:${path}`,
    })
    return hiddenByUser ? hidePreviewState(state) : state
  }

  if (documentKind === 'latex') {
    const targetResolution = normalizeTargetResolution(
      options.targetResolution,
      previewTargetPath ? 'resolved' : 'unresolved',
    )
    const previewVisible = targetResolution === 'resolved' && artifactReady && !hiddenByUser
    return createPreviewState({
      useWorkspace: true,
      previewVisible,
      previewKind: 'pdf',
      previewMode: previewVisible ? 'pdf' : null,
      targetResolution,
      reason: hiddenByUser
        ? 'hidden-by-user'
        : previewVisible
          ? 'workspace-latex'
          : targetResolution === 'unresolved'
            ? 'unresolved-target'
            : 'preview-unavailable',
      legacyReadOnly: false,
      allowPreviewCreation: true,
      preserveOpenLegacy,
      sourcePath: path,
      previewTargetPath,
      previewFilePath: previewVisible ? previewTargetPath : '',
    })
  }

  if (documentKind === 'typst') {
    const preferPdf = requestedPreviewKind === 'pdf'
    const nativePreviewSupported = preferPdf
      ? false
      : options.nativePreviewSupported !== false && options.typstNativeReady !== false

    if (nativePreviewSupported) {
      const state = createPreviewState({
        useWorkspace: true,
        previewVisible: true,
        previewKind: 'native',
        previewMode: 'typst-native',
        targetResolution: 'not-needed',
        reason: 'workspace-typst-native',
        legacyReadOnly: false,
        allowPreviewCreation: true,
        preserveOpenLegacy,
        sourcePath: path,
        previewFilePath: `typst-preview:${path}`,
      })
      return hiddenByUser ? hidePreviewState(state) : state
    }

    const targetResolution = normalizeTargetResolution(
      options.targetResolution,
      previewTargetPath ? 'resolved' : 'unresolved',
    )
    const previewVisible = targetResolution === 'resolved' && artifactReady && !hiddenByUser
    return createPreviewState({
      useWorkspace: true,
      previewVisible,
      previewKind: 'pdf',
      previewMode: previewVisible ? 'pdf' : null,
      targetResolution,
      reason: hiddenByUser
        ? 'hidden-by-user'
        : previewVisible
          ? 'workspace-typst-pdf-fallback'
          : targetResolution === 'unresolved'
            ? 'unresolved-target'
            : 'preview-unavailable',
      legacyReadOnly: false,
      allowPreviewCreation: true,
      preserveOpenLegacy,
      sourcePath: path,
      previewTargetPath,
      previewFilePath: previewVisible ? previewTargetPath : '',
    })
  }

  return createPreviewState({
    sourcePath: path,
    preserveOpenLegacy,
  })
}
