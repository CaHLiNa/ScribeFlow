import { findInvalidTabs } from '../../services/editorPersistence.js'
import {
  findFirstLeaf,
  findLeaf,
  findPane,
  normalizePaneTree,
  ROOT_PANE_ID,
} from './paneTreeLayout.js'

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

export async function validateRestoredEditorTabs({
  workspaceDataDir,
  paneTree,
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
