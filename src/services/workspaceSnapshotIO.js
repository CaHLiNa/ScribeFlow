import { loadWorkspaceTreeState } from './fileTreeSystem.js'

export async function readWorkspaceTreeSnapshot(path, loadedDirs = [], options = {}) {
  const snapshot = await loadWorkspaceTreeState({
    workspacePath: path,
    currentTree: [],
    extraDirs: loadedDirs,
    includeHidden: options.includeHidden,
    displayPreferences: options.displayPreferences,
  })
  return {
    tree: Array.isArray(snapshot?.tree) ? snapshot.tree : [],
    displayTree: Array.isArray(snapshot?.displayTree) ? snapshot.displayTree : [],
    flatFiles: Array.isArray(snapshot?.flatFiles) ? snapshot.flatFiles : [],
  }
}

export async function readWorkspaceFlatFiles(path, options = {}) {
  const snapshot = await readWorkspaceTreeSnapshot(path, [], options)
  return Array.isArray(snapshot?.flatFiles) ? snapshot.flatFiles : []
}
