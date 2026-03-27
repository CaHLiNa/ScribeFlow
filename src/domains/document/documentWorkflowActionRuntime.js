import { createDocumentWorkflowBuildOperationRuntime } from './documentWorkflowBuildOperationRuntime.js'
import { createDocumentWorkflowTypstPaneRuntime } from './documentWorkflowTypstPaneRuntime.js'

const WORKSPACE_PREVIEW_DELIVERY = 'workspace'
const LEGACY_PANE_PREVIEW_DELIVERY = 'legacy-pane'

function resolvePreviewDelivery(options = {}) {
  if (options.previewDelivery === LEGACY_PANE_PREVIEW_DELIVERY) {
    return LEGACY_PANE_PREVIEW_DELIVERY
  }
  if (options.previewDelivery === WORKSPACE_PREVIEW_DELIVERY) {
    return WORKSPACE_PREVIEW_DELIVERY
  }
  return options.allowLegacyPaneResult === true
    ? LEGACY_PANE_PREVIEW_DELIVERY
    : WORKSPACE_PREVIEW_DELIVERY
}

function usesLegacyPanePreviewDelivery(options = {}) {
  return resolvePreviewDelivery(options) === LEGACY_PANE_PREVIEW_DELIVERY
}

function resolvePreviewModeFromKind(previewKind) {
  if (previewKind === 'html') return 'markdown'
  if (previewKind === 'native') return 'typst-native'
  return previewKind || null
}

function createLegacyPanePreviewToggle(workflowStore, filePath, options = {}) {
  const toggleOptions = {
    previewKind: options.previewKind,
    activatePreview: true,
    sourcePaneId: options.sourcePaneId,
    trigger: options.trigger,
  }
  if (options.jump === true) {
    toggleOptions.jump = true
  }
  return workflowStore?.togglePreviewForSource?.(filePath, toggleOptions) || null
}

export function createDocumentWorkflowActionRuntime({
  getWorkflowStore,
  getBuildOperationRuntime = () => createDocumentWorkflowBuildOperationRuntime(),
  getTypstPaneRuntime = () => createDocumentWorkflowTypstPaneRuntime({
    getEditorStore: undefined,
    getWorkflowStore,
  }),
} = {}) {
  function resolveWorkspacePreviewState(filePath, options = {}) {
    const workflowStore = getWorkflowStore?.() || null
    return workflowStore?.getWorkspacePreviewStateForFile?.(filePath, options.buildOptions || {}) || null
  }

  function toggleMarkdownPreviewForFile(filePath, options = {}) {
    if (!filePath) return null

    const workflowStore = getWorkflowStore?.() || null
    if (!workflowStore) return null

    if (usesLegacyPanePreviewDelivery(options)) {
      return createLegacyPanePreviewToggle(workflowStore, filePath, {
        previewKind: 'html',
        sourcePaneId: options.sourcePaneId,
        trigger: options.trigger || 'markdown-preview-toggle',
      })
    }

    const previewState = resolveWorkspacePreviewState(filePath, options)
    if (previewState?.previewVisible && previewState?.previewMode === 'markdown') {
      return workflowStore.hideWorkspacePreviewForFile?.(filePath) || null
    }
    return workflowStore.showWorkspacePreviewForFile?.(filePath, {
      previewKind: 'html',
      sourcePaneId: options.sourcePaneId,
      trigger: options.trigger || 'markdown-preview-toggle',
    }) || null
  }

  function togglePdfPreviewForFile(filePath, options = {}) {
    if (!filePath) return null

    const workflowStore = getWorkflowStore?.() || null
    if (!workflowStore) return null

    if (usesLegacyPanePreviewDelivery(options)) {
      return createLegacyPanePreviewToggle(workflowStore, filePath, {
        previewKind: 'pdf',
        sourcePaneId: options.sourcePaneId,
        trigger: options.trigger || `${options.adapterKind || 'document'}-preview-toggle`,
      })
    }

    const previewState = resolveWorkspacePreviewState(filePath, options)
    if (previewState?.previewVisible && previewState?.previewMode === 'pdf') {
      return workflowStore.hideWorkspacePreviewForFile?.(filePath) || null
    }
    return workflowStore.switchWorkspacePreviewModeForFile?.(filePath, {
      previewKind: 'pdf',
      sourcePaneId: options.sourcePaneId,
      trigger: options.trigger || `${options.adapterKind || 'document'}-preview-toggle`,
    }) || null
  }

  async function runPrimaryActionForFile(filePath, options = {}) {
    if (!filePath) return null

    const uiState = options.uiState || null
    if (!uiState?.kind || uiState.kind === 'text') return null

    if (uiState.kind === 'markdown') {
      return toggleMarkdownPreviewForFile(filePath, options)
    }

    if (uiState.kind === 'latex' || uiState.kind === 'typst') {
      const buildOperationRuntime = getBuildOperationRuntime?.() || null
      return buildOperationRuntime?.runBuildForFile?.(filePath, {
        ...(options.buildOptions || {}),
        sourcePaneId: options.sourcePaneId,
        trigger: options.trigger || `${uiState.kind}-compile-button`,
      }) || null
    }

    return null
  }

  async function revealPreviewForFile(filePath, options = {}) {
    if (!filePath) return null

    const workflowStore = getWorkflowStore?.() || null
    const uiState = options.uiState || null
    if (!uiState?.kind || uiState.kind === 'text') return null

    if (uiState.kind === 'markdown') {
      return toggleMarkdownPreviewForFile(filePath, {
        ...options,
        trigger: options.trigger || 'workflow-toggle-preview',
      })
    }

    if (uiState.kind === 'typst' && usesLegacyPanePreviewDelivery(options)) {
      const typstPaneRuntime = getTypstPaneRuntime?.() || null
      return typstPaneRuntime?.revealPreviewForFile?.(filePath, {
        sourcePaneId: options.sourcePaneId,
        buildOptions: options.buildOptions || {},
        allowLegacyPaneResult: true,
      }) || null
    }

    if (!workflowStore) return null

    if (usesLegacyPanePreviewDelivery(options)) {
      return createLegacyPanePreviewToggle(workflowStore, filePath, {
        previewKind: uiState.previewKind,
        jump: true,
        sourcePaneId: options.sourcePaneId,
        trigger: options.trigger || 'workflow-toggle-preview',
      })
    }

    const previewState = resolveWorkspacePreviewState(filePath, options)
    if (
      previewState?.previewVisible
      && previewState?.previewMode === resolvePreviewModeFromKind(uiState.previewKind)
    ) {
      return workflowStore.hideWorkspacePreviewForFile?.(filePath) || null
    }

    return workflowStore.showWorkspacePreviewForFile?.(filePath, {
      previewKind: uiState.previewKind,
      sourcePaneId: options.sourcePaneId,
      trigger: options.trigger || 'workflow-toggle-preview',
    }) || null
  }

  function revealPdfForFile(filePath, options = {}) {
    if (!filePath) return null

    const uiState = options.uiState || null
    if (uiState?.kind !== 'typst') return null

    if (usesLegacyPanePreviewDelivery(options)) {
      const typstPaneRuntime = getTypstPaneRuntime?.() || null
      return typstPaneRuntime?.revealPdfForFile?.(filePath, {
        sourcePaneId: options.sourcePaneId,
        buildOptions: options.buildOptions || {},
        allowLegacyPaneResult: true,
      }) || null
    }

    return togglePdfPreviewForFile(filePath, {
      ...options,
      adapterKind: 'typst',
      trigger: options.trigger || 'typst-pdf-toggle',
    })
  }

  return {
    toggleMarkdownPreviewForFile,
    togglePdfPreviewForFile,
    runPrimaryActionForFile,
    revealPreviewForFile,
    revealPdfForFile,
  }
}
