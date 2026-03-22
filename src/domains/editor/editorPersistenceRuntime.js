import { loadState, saveState } from '../../services/editorPersistence'

let saveStateTimer = null

export function buildRecentFilesAfterOpen(recentFiles = [], path = '') {
  const nextRecentFiles = recentFiles.filter((entry) => entry.path !== path)
  nextRecentFiles.unshift({ path, openedAt: Date.now() })
  if (nextRecentFiles.length > 20) nextRecentFiles.length = 20
  return nextRecentFiles
}

export function loadRecentFilesForWorkspace(workspacePath) {
  try {
    const stored = localStorage.getItem(`recentFiles:${workspacePath}`)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function persistRecentFilesForWorkspace(workspacePath, recentFiles = []) {
  if (!workspacePath) return false
  localStorage.setItem(`recentFiles:${workspacePath}`, JSON.stringify(recentFiles))
  return true
}

export function scheduleEditorStateSave({ shouldersDir, paneTree, activePaneId, delayMs = 500 } = {}) {
  clearTimeout(saveStateTimer)
  saveStateTimer = setTimeout(() => {
    void saveState(shouldersDir, paneTree, activePaneId)
  }, delayMs)
}

export async function flushEditorStateSave({ shouldersDir, paneTree, activePaneId } = {}) {
  clearTimeout(saveStateTimer)
  saveStateTimer = null
  await saveState(shouldersDir, paneTree, activePaneId)
}

export function cancelEditorStateSave() {
  clearTimeout(saveStateTimer)
  saveStateTimer = null
}

export async function loadEditorStateSnapshot(shouldersDir) {
  return loadState(shouldersDir)
}
