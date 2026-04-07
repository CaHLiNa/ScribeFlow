import { invoke } from '@tauri-apps/api/core'

export async function readWorkspaceTreeSnapshot(path, loadedDirs = []) {
  return invoke('read_workspace_tree_snapshot', { path, loadedDirs })
}

export async function readWorkspaceFlatFiles(path) {
  const snapshot = await readWorkspaceTreeSnapshot(path, [])
  return Array.isArray(snapshot?.flatFiles) ? snapshot.flatFiles : []
}
