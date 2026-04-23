import {
  loadRecentFiles,
  loadState,
  saveRecentFiles,
  saveState,
} from '../../services/editorPersistence.js'

let saveStateTimer = null
let queuedStateKey = ''
let persistedStateKey = ''

function buildEditorStatePayload({
  workspaceDataDir,
  paneTree,
  activePaneId,
  legacyPreviewPaths,
  lastContextPath,
} = {}) {
  return {
    workspaceDataDir,
    paneTree,
    activePaneId,
    legacyPreviewPaths: Array.isArray(legacyPreviewPaths)
      ? legacyPreviewPaths
      : Array.from(legacyPreviewPaths || []),
    lastContextPath: String(lastContextPath || ''),
  }
}

function buildEditorStateKey(payload = {}) {
  return JSON.stringify(payload)
}

export function buildRecentFilesAfterOpen(recentFiles = [], path = '') {
  const nextRecentFiles = recentFiles.filter((entry) => entry.path !== path)
  nextRecentFiles.unshift({ path, openedAt: Date.now() })
  if (nextRecentFiles.length > 20) nextRecentFiles.length = 20
  return nextRecentFiles
}

export async function loadRecentFilesForWorkspace(workspaceDataDir, workspacePath) {
  return loadRecentFiles(workspaceDataDir, workspacePath)
}

export async function persistRecentFilesForWorkspace(workspaceDataDir, workspacePath, recentFiles = []) {
  return saveRecentFiles(workspaceDataDir, workspacePath, recentFiles)
}

export function scheduleEditorStateSave({
  workspaceDataDir,
  paneTree,
  activePaneId,
  legacyPreviewPaths,
  lastContextPath,
  delayMs = 500,
} = {}) {
  const payload = buildEditorStatePayload({
    workspaceDataDir,
    paneTree,
    activePaneId,
    legacyPreviewPaths,
    lastContextPath,
  })
  const nextStateKey = buildEditorStateKey(payload)
  if (!workspaceDataDir || nextStateKey === queuedStateKey || nextStateKey === persistedStateKey) {
    return false
  }

  queuedStateKey = nextStateKey
  clearTimeout(saveStateTimer)
  saveStateTimer = setTimeout(() => {
    void saveState(payload.workspaceDataDir, payload.paneTree, payload.activePaneId, {
      legacyPreviewPaths: payload.legacyPreviewPaths,
      lastContextPath: payload.lastContextPath,
    }).then((result) => {
      if (result != null) {
        persistedStateKey = nextStateKey
      }
    }).finally(() => {
      if (queuedStateKey === nextStateKey) {
        queuedStateKey = ''
      }
      saveStateTimer = null
    })
  }, delayMs)
  return true
}

export async function flushEditorStateSave({
  workspaceDataDir,
  paneTree,
  activePaneId,
  legacyPreviewPaths,
  lastContextPath,
} = {}) {
  const payload = buildEditorStatePayload({
    workspaceDataDir,
    paneTree,
    activePaneId,
    legacyPreviewPaths,
    lastContextPath,
  })
  const nextStateKey = buildEditorStateKey(payload)
  clearTimeout(saveStateTimer)
  saveStateTimer = null
  queuedStateKey = ''
  if (!workspaceDataDir || nextStateKey === persistedStateKey) {
    return null
  }
  const result = await saveState(payload.workspaceDataDir, payload.paneTree, payload.activePaneId, {
    legacyPreviewPaths: payload.legacyPreviewPaths,
    lastContextPath: payload.lastContextPath,
  })
  if (result != null) {
    persistedStateKey = nextStateKey
  }
  return result
}

export function cancelEditorStateSave() {
  clearTimeout(saveStateTimer)
  saveStateTimer = null
  queuedStateKey = ''
}

export async function loadEditorStateSnapshot(workspaceDataDir) {
  const state = await loadState(workspaceDataDir)
  if (state) {
    persistedStateKey = buildEditorStateKey(buildEditorStatePayload({
      workspaceDataDir,
      paneTree: state.paneTree,
      activePaneId: state.activePaneId,
      legacyPreviewPaths: state.legacyPreviewPaths,
      lastContextPath: state.lastContextPath,
    }))
  }
  return state
}
