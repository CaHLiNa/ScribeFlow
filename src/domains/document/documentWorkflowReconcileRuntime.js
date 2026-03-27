import { getViewerType } from '../../utils/fileTypes.js'
import { findFirstLeaf, findRightNeighborLeaf } from '../editor/paneTreeLayout.js'
import { createDocumentWorkspacePreviewAction } from './documentWorkspacePreviewRuntime.js'

function getLeaves(node) {
  if (!node) return []
  if (node.type === 'leaf') return [node]
  return (node.children || []).flatMap(getLeaves)
}

function findLeafWithTab(node, tabPath) {
  return getLeaves(node).find(leaf => leaf.tabs.includes(tabPath)) || null
}

function isPreviewCapableLeaf(leaf) {
  if (!leaf) return false
  if (!leaf.activeTab) return true
  const viewerType = getViewerType(leaf.activeTab)
  return viewerType === 'markdown-preview' || viewerType === 'typst-native-preview' || viewerType === 'pdf'
}

function matchesPreviewBinding(tabPath, sourcePath, preferredPreview, workflowStore) {
  const binding = workflowStore.getPreviewBinding(tabPath)
  if (binding?.sourcePath === sourcePath) {
    if (!preferredPreview || binding.previewKind === preferredPreview) return true
  }

  const inferredKind = workflowStore.inferPreviewKind(sourcePath, tabPath)
  return inferredKind !== null && (!preferredPreview || inferredKind === preferredPreview)
}

function chooseWorkflowPreviewAction(context, options = {}) {
  const kind = options.getDocumentWorkflowKind?.(context?.activeFile) || null
  if (!kind) {
    return { type: 'inactive', kind: null }
  }

  const sourcePath = context.activeFile
  const previewKind = options.preferredPreview || 'html'
  const previewPath = options.previewPath || options.createWorkflowPreviewPath?.(sourcePath, kind, previewKind) || null

  if (options.allowLegacyPaneResult && context?.detachedSources?.[sourcePath] && !options.force) {
    return {
      type: 'detached',
      kind,
      sourcePath,
      previewKind,
      previewPath,
      sourcePaneId: context.activePaneId,
    }
  }

  return {
    type: 'needs-preview',
    kind,
    sourcePath,
    previewKind,
    previewPath,
    sourcePaneId: context.activePaneId,
  }
}

export function reconcileDocumentWorkflow({
  activeFile,
  activePaneId,
  paneTree,
  trigger,
  workflowStore,
  createWorkspacePreviewAction = createDocumentWorkspacePreviewAction,
  getDocumentWorkflowKind,
  getPreferredWorkflowPreviewKind,
  createWorkflowPreviewPath,
  force = false,
  previewKindOverride = null,
  allowLegacyPaneResult = false,
}) {
  const kind = getDocumentWorkflowKind?.(activeFile) || null
  if (!kind) {
    return {
      type: 'inactive',
      trigger,
      kind: null,
      sourcePath: null,
      previewPath: null,
      previewKind: null,
      sourcePaneId: activePaneId || null,
      previewPaneId: null,
      state: 'inactive',
    }
  }

  const sourcePath = activeFile
  const preferredPreview = previewKindOverride || getPreferredWorkflowPreviewKind?.(kind, workflowStore.previewPrefs)
  const previewPath = createWorkflowPreviewPath?.(sourcePath, kind, preferredPreview)
  const base = chooseWorkflowPreviewAction({
    activeFile,
    activePaneId,
    paneTree,
    detachedSources: workflowStore.session.detachedSources,
  }, {
    preferredPreview,
    previewPath,
    getDocumentWorkflowKind,
    createWorkflowPreviewPath,
    force,
    allowLegacyPaneResult,
  })

  if (base.type === 'detached') {
    return {
      ...base,
      trigger,
      previewPaneId: null,
      state: 'detached-by-user',
    }
  }

  let matchedLegacyPreview = null
  for (const leaf of getLeaves(paneTree)) {
    for (const tabPath of leaf.tabs) {
      if (matchesPreviewBinding(tabPath, sourcePath, preferredPreview, workflowStore)) {
        matchedLegacyPreview = {
          previewPath: tabPath,
          previewPaneId: leaf.id,
        }
        break
      }
    }
    if (matchedLegacyPreview) break
  }

  if (!allowLegacyPaneResult) {
    const workspacePreview = createWorkspacePreviewAction?.({
      path: sourcePath,
      sourcePaneId: activePaneId,
      trigger,
      nativePreviewSupported: kind !== 'typst' || preferredPreview !== 'pdf',
      preserveOpenLegacy: !!matchedLegacyPreview,
      legacyPreviewPath: matchedLegacyPreview?.previewPath || '',
      legacyPreviewPaneId: matchedLegacyPreview?.previewPaneId || null,
    })
    if (workspacePreview) return workspacePreview
  }

  if (matchedLegacyPreview) {
    return {
      ...base,
      type: 'ready-existing',
      trigger,
      previewPath: matchedLegacyPreview.previewPath,
      previewPaneId: matchedLegacyPreview.previewPaneId,
      state: 'ready',
    }
  }

  if (!force) {
    return {
      ...base,
      type: 'source-only',
      trigger,
      previewPaneId: null,
      state: 'source-only',
    }
  }

  const neighbor = findRightNeighborLeaf(paneTree, activePaneId)
  if (neighbor && isPreviewCapableLeaf(neighbor)) {
    return {
      ...base,
      type: 'open-neighbor',
      trigger,
      previewPaneId: neighbor.id,
      state: 'needs-preview',
    }
  }

  return {
    ...base,
    type: 'split-right',
    trigger,
    previewPaneId: null,
    state: 'needs-preview',
  }
}

export function findWorkflowPreviewPane(paneTree, previewPath) {
  return findLeafWithTab(paneTree, previewPath)
}

export { findFirstLeaf, findRightNeighborLeaf }
