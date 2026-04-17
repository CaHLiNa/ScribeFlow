import { invoke } from '@tauri-apps/api/core'

export async function mergeLoadedTreeEntries(nextEntries = [], previousEntries = []) {
  return invoke('fs_tree_merge_loaded_children', {
    params: {
      nextEntries,
      previousEntries,
    },
  })
}

export async function collectLoadedTreeDirs(entries = [], workspacePath = '', extraDirs = []) {
  return invoke('fs_tree_collect_loaded_dirs', {
    params: {
      entries,
      workspacePath,
      extraDirs,
    },
  })
}

export async function patchTreeDirChildren(entries = [], targetPath = '', children = []) {
  return invoke('fs_tree_patch_dir_children', {
    params: {
      entries,
      targetPath,
      children,
    },
  })
}

export async function listAncestorTreeDirs(workspacePath = '', targetPath = '') {
  return invoke('fs_tree_ancestor_dirs', {
    params: {
      workspacePath,
      targetPath,
    },
  })
}
