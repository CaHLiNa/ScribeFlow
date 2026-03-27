import { createDocumentWorkflowBuildOperationRuntime } from './documentWorkflowBuildOperationRuntime.js'
import { createDocumentWorkflowTypstPaneRuntime } from './documentWorkflowTypstPaneRuntime.js'
import { createDocumentWorkspacePreviewAction } from './documentWorkspacePreviewRuntime.js'

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

function createWorkspacePreviewResult(filePath, options = {}) {
  if (!filePath) return null

  const uiState = options.uiState || null
  const requestedPreviewKind = options.previewKind || uiState?.previewKind || null
  return createDocumentWorkspacePreviewAction({
    path: filePath,
    sourcePaneId: options.sourcePaneId,
    trigger: options.trigger,
    nativePreviewSupported: uiState?.kind !== 'typst' || requestedPreviewKind !== 'pdf',
  })
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
  getTypstPaneRuntime = () => createDocumentWorkflowTypstPaneRuntime(),
} = {}) {
  function toggleMarkdownPreviewForFile(filePath, options = {}) {
    if (!filePath) return null

    if (!usesLegacyPanePreviewDelivery(options)) {
      return createWorkspacePreviewResult(filePath, {
        ...options,
        trigger: options.trigger || 'markdown-preview-toggle',
      })
    }

    const workflowStore = getWorkflowStore?.() || null
    return createLegacyPanePreviewToggle(workflowStore, filePath, {
      previewKind: 'html',
      sourcePaneId: options.sourcePaneId,
      trigger: options.trigger || 'markdown-preview-toggle',
    })
  }

  function togglePdfPreviewForFile(filePath, options = {}) {
    if (!filePath) return null

    if (!usesLegacyPanePreviewDelivery(options)) {
      return createWorkspacePreviewResult(filePath, {
        ...options,
        uiState: {
          kind: options.adapterKind === 'typst' ? 'typst' : 'latex',
          previewKind: 'pdf',
        },
        trigger: options.trigger || `${options.adapterKind || 'document'}-preview-toggle`,
      })
    }

    const workflowStore = getWorkflowStore?.() || null
    return createLegacyPanePreviewToggle(workflowStore, filePath, {
      previewKind: 'pdf',
      sourcePaneId: options.sourcePaneId,
      trigger: options.trigger || `${options.adapterKind || 'document'}-preview-toggle`,
    })
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
      return createWorkspacePreviewResult(filePath, {
        ...options,
        trigger: options.trigger || 'workflow-toggle-preview',
      })
    }

    if (uiState.kind === 'typst') {
      const typstPaneRuntime = getTypstPaneRuntime?.() || null
      return typstPaneRuntime?.revealPreviewForFile?.(filePath, {
        sourcePaneId: options.sourcePaneId,
        buildOptions: options.buildOptions || {},
        allowLegacyPaneResult: usesLegacyPanePreviewDelivery(options),
      }) || null
    }

    if (!usesLegacyPanePreviewDelivery(options)) {
      return createWorkspacePreviewResult(filePath, {
        ...options,
        trigger: options.trigger || 'workflow-toggle-preview',
      })
    }

    if (!workflowStore) return null

    return createLegacyPanePreviewToggle(workflowStore, filePath, {
      previewKind: uiState.previewKind,
      jump: true,
      sourcePaneId: options.sourcePaneId,
      trigger: options.trigger || 'workflow-toggle-preview',
    })
  }

  function revealPdfForFile(filePath, options = {}) {
    if (!filePath) return null

    const uiState = options.uiState || null
    if (uiState?.kind !== 'typst') return null

    const typstPaneRuntime = getTypstPaneRuntime?.() || null
    return typstPaneRuntime?.revealPdfForFile?.(filePath, {
      sourcePaneId: options.sourcePaneId,
      buildOptions: options.buildOptions || {},
      allowLegacyPaneResult: usesLegacyPanePreviewDelivery(options),
    }) || null
  }

  return {
    toggleMarkdownPreviewForFile,
    togglePdfPreviewForFile,
    runPrimaryActionForFile,
    revealPreviewForFile,
    revealPdfForFile,
  }
}
