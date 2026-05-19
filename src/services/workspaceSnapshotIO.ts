import { loadWorkspaceTreeState } from './fileTreeSystem.ts'

export async function readWorkspaceTreeSnapshot(path, loadedDirs = [], options = {}) {
  return loadWorkspaceTreeState({
    workspacePath: path,
    currentTree: [],
    extraDirs: loadedDirs,
    includeHidden: options.includeHidden,
    displayPreferences: options.displayPreferences,
  })
}

export async function readWorkspaceFlatFiles(path, options = {}) {
  const snapshot = await readWorkspaceTreeSnapshot(path, [], options)
  return snapshot.flatFiles
}
