import { invoke } from '@tauri-apps/api/core'
import { clearStorageKeys, readStorageJson } from './bridgeStorage.js'

function recentFilesStorageKey(workspacePath = '') {
  return `recentFiles:${workspacePath}`
}

function readLegacyRecentFiles(workspacePath = '') {
  return workspacePath ? readStorageJson(recentFilesStorageKey(workspacePath), []) : []
}

function clearLegacyRecentFiles(workspacePath = '') {
  if (!workspacePath) return
  clearStorageKeys([recentFilesStorageKey(workspacePath)])
}

export async function loadRecentFiles(workspaceDataDir = '', workspacePath = '') {
  if (!workspaceDataDir) return []

  const recentFiles = await invoke('editor_recent_files_load', {
    params: {
      workspaceDataDir,
      legacyRecentFiles: readLegacyRecentFiles(workspacePath),
    },
  })
  clearLegacyRecentFiles(workspacePath)
  return Array.isArray(recentFiles) ? recentFiles : []
}

export async function recordRecentFileOpen(workspaceDataDir = '', recentFiles = [], path = '') {
  const saved = await invoke('editor_recent_files_record_opened', {
    params: {
      workspaceDataDir: String(workspaceDataDir || ''),
      recentFiles,
      path: String(path || ''),
    },
  })
  return Array.isArray(saved) ? saved : []
}

export async function renameRecentFilePath(
  workspaceDataDir = '',
  recentFiles = [],
  oldPath = '',
  newPath = '',
) {
  const saved = await invoke('editor_recent_files_rename_path', {
    params: {
      workspaceDataDir: String(workspaceDataDir || ''),
      recentFiles,
      oldPath: String(oldPath || ''),
      newPath: String(newPath || ''),
    },
  })
  return Array.isArray(saved) ? saved : []
}
