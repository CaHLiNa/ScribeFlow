import { loadWorkspaceTreeState } from './fileTreeSystem.js'

export async function readWorkspaceTreeSnapshot(path, loadedDirs = [], options = {}) {
  const snapshot = await loadWorkspaceTreeState({
    workspacePath: String(path || ''),
    currentTree: [],
    extraDirs: Array.isArray(loadedDirs) ? loadedDirs : [],
    includeHidden: options.includeHidden !== false,
  })
  return {
    tree: Array.isArray(snapshot?.tree) ? snapshot.tree : [],
    flatFiles: Array.isArray(snapshot?.flatFiles) ? snapshot.flatFiles : [],
  }
}

export async function readWorkspaceFlatFiles(path, options = {}) {
  const snapshot = await readWorkspaceTreeSnapshot(path, [], options)
  return Array.isArray(snapshot?.flatFiles) ? snapshot.flatFiles : []
}
