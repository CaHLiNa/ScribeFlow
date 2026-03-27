import {
  isLatex,
  isMarkdown,
  isMarkdownPreviewPath,
  isTypst,
  isTypstPreviewPath,
  previewSourcePathFromPath,
} from '../../utils/fileTypes.js'

function getWorkspaceDocumentKind(path) {
  if (!path || typeof path !== 'string') return null
  if (isMarkdown(path)) return 'markdown'
  if (isLatex(path)) return 'latex'
  if (isTypst(path)) return 'typst'
  return null
}

function resolvePreviewTargetPath(options = {}) {
  return options.resolvedTargetPath || options.previewTargetPath || ''
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
    ...overrides,
  }
}

function resolveLegacyPreviewState(path, options = {}) {
  const sourcePath = options.sourcePath || previewSourcePathFromPath(path) || ''
  return createPreviewState({
    useWorkspace: false,
    previewVisible: true,
    previewKind: isMarkdownPreviewPath(path) ? 'html' : 'native',
    previewMode: isMarkdownPreviewPath(path) ? 'markdown' : 'typst-native',
    targetResolution: 'legacy',
    reason: 'legacy-preview-tab',
    legacyReadOnly: true,
    allowPreviewCreation: false,
    preserveOpenLegacy: true,
    sourcePath,
  })
}

export function shouldUseDocumentWorkspaceTab(path) {
  return getWorkspaceDocumentKind(path) !== null
}

export function shouldShowPdfToolbarTarget(viewerType, documentPreviewState = null) {
  if (viewerType === 'pdf') return true
  return (
    documentPreviewState?.useWorkspace === true
    && documentPreviewState?.previewVisible === true
    && documentPreviewState?.previewKind === 'pdf'
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
    previewMode: previewState.previewMode,
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
  const path = options.path || options.filePath || ''
  if (isMarkdownPreviewPath(path) || isTypstPreviewPath(path)) {
    return resolveLegacyPreviewState(path, options)
  }

  const documentKind = getWorkspaceDocumentKind(path)
  const preserveOpenLegacy = options.preserveOpenLegacy === true || options.hasOpenLegacyPreview === true
  const previewTargetPath = resolvePreviewTargetPath(options)

  if (documentKind === 'markdown') {
    return createPreviewState({
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
    })
  }

  if (documentKind === 'latex') {
    if (!previewTargetPath) {
      return createPreviewState({
        useWorkspace: true,
        previewVisible: false,
        previewKind: 'pdf',
        previewMode: 'pdf',
        targetResolution: 'unresolved',
        reason: 'unresolved-target',
        legacyReadOnly: false,
        allowPreviewCreation: true,
        preserveOpenLegacy,
        sourcePath: path,
      })
    }

    return createPreviewState({
      useWorkspace: true,
      previewVisible: true,
      previewKind: 'pdf',
      previewMode: 'pdf',
      targetResolution: 'resolved',
      reason: 'workspace-latex',
      legacyReadOnly: false,
      allowPreviewCreation: true,
      preserveOpenLegacy,
      sourcePath: path,
      previewTargetPath,
    })
  }

  if (documentKind === 'typst') {
    if (options.nativePreviewSupported !== false) {
      return createPreviewState({
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
      })
    }

    if (!previewTargetPath) {
      return createPreviewState({
        useWorkspace: true,
        previewVisible: false,
        previewKind: 'pdf',
        previewMode: 'pdf',
        targetResolution: 'unresolved',
        reason: 'unresolved-target',
        legacyReadOnly: false,
        allowPreviewCreation: true,
        preserveOpenLegacy,
        sourcePath: path,
      })
    }

    return createPreviewState({
      useWorkspace: true,
      previewVisible: true,
      previewKind: 'pdf',
      previewMode: 'pdf',
      targetResolution: 'resolved',
      reason: 'workspace-typst-pdf-fallback',
      legacyReadOnly: false,
      allowPreviewCreation: true,
      preserveOpenLegacy,
      sourcePath: path,
      previewTargetPath,
    })
  }

  return createPreviewState({
    sourcePath: path,
    preserveOpenLegacy,
  })
}
