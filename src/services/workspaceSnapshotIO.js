import { invoke } from '@tauri-apps/api/core'

export async function readWorkspaceTreeSnapshot(path, loadedDirs = [], options = {}) {
  return invoke('read_workspace_tree_snapshot', {
    path,
    loadedDirs,
    includeHidden: options.includeHidden !== false,
  })
}

export async function readWorkspaceFlatFiles(path, options = {}) {
  const snapshot = await readWorkspaceTreeSnapshot(path, [], options)
  return Array.isArray(snapshot?.flatFiles) ? snapshot.flatFiles : []
}
