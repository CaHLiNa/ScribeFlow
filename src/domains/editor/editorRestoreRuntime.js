import {
  findFirstLeaf,
  findLeaf,
  findPane,
  normalizePaneTree,
  ROOT_PANE_ID,
} from './paneTreeLayout.js'

function collectPaneTabs(node, tabs = []) {
  if (!node) return tabs
  if (node.type === 'leaf') {
    for (const tab of node.tabs || []) {
      if (typeof tab === 'string' && tab) tabs.push(tab)
    }
    return tabs
  }
  for (const child of node.children || []) {
    collectPaneTabs(child, tabs)
  }
  return tabs
}

function normalizeDocumentDockTabs(tabs = []) {
  const seen = new Set()
  const normalized = []
  for (const tab of Array.isArray(tabs) ? tabs : []) {
    if (typeof tab !== 'string' || !tab || seen.has(tab)) continue
    seen.add(tab)
    normalized.push(tab)
  }
  return normalized
}

export function deriveRestoredEditorRuntimeState({
  state,
  isContextCandidatePath,
} = {}) {
  const paneTree = normalizePaneTree(state?.paneTree)

  const restoredActivePane = state?.activePaneId
    ? findPane(paneTree, state.activePaneId)
    : null
  const fallbackLeaf = findFirstLeaf(paneTree)
  const activePaneId = restoredActivePane?.id || fallbackLeaf?.id || ROOT_PANE_ID
  const activePane = findPane(paneTree, activePaneId)
  const documentDockTabs = normalizeDocumentDockTabs(state?.documentDockTabs)
  const activeDocumentDockTab = documentDockTabs.includes(state?.activeDocumentDockTab)
    ? state.activeDocumentDockTab
    : documentDockTabs[0] || null
  const contextCandidates = new Set([
    ...collectPaneTabs(paneTree),
    ...documentDockTabs,
  ].filter((path) => isContextCandidatePath?.(path)))

  const contextLeaf = isContextCandidatePath?.(activePane?.activeTab)
    ? activePane
    : findLeaf(paneTree, (node) => isContextCandidatePath?.(node.activeTab))
  const restoredLastContextPath = isContextCandidatePath?.(state?.lastContextPath) &&
    contextCandidates.has(state.lastContextPath)
    ? state.lastContextPath
    : null
  const dockContextPath = isContextCandidatePath?.(activeDocumentDockTab)
    ? activeDocumentDockTab
    : null
  const paneContextPath = contextLeaf?.activeTab || null
  const fallbackContextPath = [...contextCandidates][0] || null

  return {
    paneTree,
    activePaneId,
    documentDockTabs,
    activeDocumentDockTab,
    lastContextPath: restoredLastContextPath || dockContextPath || paneContextPath || fallbackContextPath,
  }
}

export async function validateRestoredEditorTabs({
  workspaceDataDir,
  paneTree,
  findInvalidTabs,
  isStillCurrent,
  closeInvalidTab,
  isActivePaneMissing,
  resolveFallbackActivePaneId,
  onActivePaneResolved,
  onError,
} = {}) {
  try {
    const invalidTabs = await findInvalidTabs(workspaceDataDir, paneTree)
    if (!isStillCurrent?.()) return false
    if (invalidTabs.size === 0) return true

    for (const tab of invalidTabs) {
      closeInvalidTab?.(tab)
    }

    if (isActivePaneMissing?.()) {
      onActivePaneResolved?.(resolveFallbackActivePaneId?.() || ROOT_PANE_ID)
    }

    return true
  } catch (error) {
    onError?.(error)
    return false
  }
}
