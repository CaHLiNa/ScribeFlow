import { getViewerType } from '../../utils/fileTypes.js'
import {
  createWorkflowPreviewPath,
  getDocumentWorkflowKind,
  getPreferredWorkflowPreviewKind,
} from './policy.js'

function getLeaves(node) {
  if (!node) return []
  if (node.type === 'leaf') return [node]
  return (node.children || []).flatMap(getLeaves)
}

function findLeafWithTab(node, tabPath) {
  return getLeaves(node).find(leaf => leaf.tabs.includes(tabPath)) || null
}

function pathToPane(node, paneId, trail = []) {
  if (!node) return null
  if (node.type === 'leaf') {
    return node.id === paneId ? [...trail, node] : null
  }
  for (const child of node.children || []) {
    const found = pathToPane(child, paneId, [...trail, node])
    if (found) return found
  }
  return null
}

function findFirstLeaf(node) {
  if (!node) return null
  if (node.type === 'leaf') return node
  for (const child of node.children || []) {
    const found = findFirstLeaf(child)
    if (found) return found
  }
  return null
}

export function findRightNeighborLeaf(paneTree, paneId) {
  const trail = pathToPane(paneTree, paneId)
  if (!trail || trail.length < 2) return null

  for (let i = trail.length - 2; i >= 0; i -= 1) {
    const parent = trail[i]
    const child = trail[i + 1]
    if (parent?.type !== 'split' || parent.direction !== 'vertical') continue
    const idx = (parent.children || []).findIndex(candidate => candidate === child)
    if (idx === 0 && parent.children?.[1]) {
      return findFirstLeaf(parent.children[1])
    }
  }

  return null
}

function isPreviewCapableLeaf(leaf) {
  if (!leaf) return false
  if (!leaf.activeTab) return true
  const viewerType = getViewerType(leaf.activeTab)
  return viewerType === 'markdown-preview' || viewerType === 'pdf'
}

function matchesPreviewBinding(tabPath, sourcePath, preferredPreview, workflowStore) {
  const binding = workflowStore.getPreviewBinding(tabPath)
  if (binding?.sourcePath === sourcePath) {
    if (!preferredPreview || binding.previewKind === preferredPreview) return true
  }

  const inferredKind = workflowStore.inferPreviewKind(sourcePath, tabPath)
  return inferredKind !== null && (!preferredPreview || inferredKind === preferredPreview)
}

export function chooseWorkflowPreviewAction(context, options = {}) {
  const kind = getDocumentWorkflowKind(context?.activeFile)
  if (!kind) {
    return { type: 'inactive', kind: null }
  }

  const sourcePath = context.activeFile
  const previewKind = options.preferredPreview || 'html'
  const previewPath = options.previewPath || createWorkflowPreviewPath(sourcePath, kind, previewKind)

  if (context?.detachedSources?.[sourcePath] && !options.force) {
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
  force = false,
  previewKindOverride = null,
}) {
  const kind = getDocumentWorkflowKind(activeFile)
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
  const preferredPreview = previewKindOverride || getPreferredWorkflowPreviewKind(kind, workflowStore.previewPrefs)
  const base = chooseWorkflowPreviewAction({
    activeFile,
    activePaneId,
    paneTree,
    detachedSources: workflowStore.session.detachedSources,
  }, {
    preferredPreview,
    previewPath: createWorkflowPreviewPath(sourcePath, kind, preferredPreview),
    force,
  })

  if (base.type === 'detached') {
    return {
      ...base,
      trigger,
      previewPaneId: null,
      state: 'detached-by-user',
    }
  }

  for (const leaf of getLeaves(paneTree)) {
    for (const tabPath of leaf.tabs) {
      if (matchesPreviewBinding(tabPath, sourcePath, preferredPreview, workflowStore)) {
        return {
          ...base,
          type: 'ready-existing',
          trigger,
          previewPath: tabPath,
          previewPaneId: leaf.id,
          state: 'ready',
        }
      }
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
