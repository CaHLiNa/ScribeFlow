import { findInvalidTabs } from '../../services/editorPersistence.js'
import {
  findFirstLeaf,
  findLeaf,
  findPane,
  ROOT_PANE_ID,
} from './paneTreeLayout.js'

export function deriveRestoredEditorRuntimeState({
  state,
  isContextCandidatePath,
} = {}) {
  const paneTree = state?.paneTree || {
    type: 'leaf',
    id: ROOT_PANE_ID,
    tabs: [],
    activeTab: null,
  }

  const restoredActivePane = state?.activePaneId
    ? findPane(paneTree, state.activePaneId)
    : null
  const fallbackLeaf = findFirstLeaf(paneTree)
  const activePaneId = restoredActivePane?.id || fallbackLeaf?.id || ROOT_PANE_ID
  const activePane = findPane(paneTree, activePaneId)

  const contextLeaf = isContextCandidatePath?.(activePane?.activeTab)
    ? activePane
    : findLeaf(paneTree, (node) => isContextCandidatePath?.(node.activeTab))

  return {
    paneTree,
    activePaneId,
    legacyPreviewPaths: new Set(state?.legacyPreviewPaths || []),
    lastContextPath: contextLeaf?.activeTab || null,
  }
}

export function restoreLegacyEditorSurface(workspace, legacyPrimarySurface) {
  if (legacyPrimarySurface === 'library') {
    workspace.openLibrarySurface()
    return true
  }
  if (legacyPrimarySurface === 'ai') {
    workspace.openAiSurface()
    return true
  }
  return false
}

export async function validateRestoredEditorTabs({
  shouldersDir,
  paneTree,
  isStillCurrent,
  closeInvalidTab,
  isActivePaneMissing,
  resolveFallbackActivePaneId,
  onActivePaneResolved,
  onError,
} = {}) {
  try {
    const invalidTabs = await findInvalidTabs(shouldersDir, paneTree)
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
