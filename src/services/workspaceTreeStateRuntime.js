import { invoke } from '@tauri-apps/api/core'

export async function loadWorkspaceTreeState(params = {}) {
  return invoke('fs_tree_load_workspace_state', {
    params: {
      workspacePath: String(params.workspacePath || ''),
      currentTree: Array.isArray(params.currentTree) ? params.currentTree : [],
      extraDirs: Array.isArray(params.extraDirs) ? params.extraDirs : [],
      includeHidden: params.includeHidden !== false,
    },
  })
}

export async function revealWorkspaceTreeState(params = {}) {
  return invoke('fs_tree_reveal_workspace_state', {
    params: {
      workspacePath: String(params.workspacePath || ''),
      targetPath: String(params.targetPath || ''),
      currentTree: Array.isArray(params.currentTree) ? params.currentTree : [],
      includeHidden: params.includeHidden !== false,
    },
  })
}

export async function restoreCachedExpandedTreeState(params = {}) {
  return invoke('fs_tree_restore_cached_expanded_state', {
    params: {
      workspacePath: String(params.workspacePath || ''),
      currentTree: Array.isArray(params.currentTree) ? params.currentTree : [],
      cachedRootExpandedDirs: Array.isArray(params.cachedRootExpandedDirs)
        ? params.cachedRootExpandedDirs
        : [],
      maxDirs: Number.isFinite(Number(params.maxDirs)) ? Number(params.maxDirs) : 6,
      includeHidden: params.includeHidden !== false,
    },
  })
}
