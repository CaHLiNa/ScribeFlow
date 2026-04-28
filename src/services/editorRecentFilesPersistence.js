import { invoke } from '@tauri-apps/api/core'
import { clearStorageKeys, readStorageJson } from './bridgeStorage.js'

function recentFilesStorageKey(workspacePath = '') {
  return `recentFiles:${workspacePath}`
}

function normalizeRecentFiles(recentFiles = []) {
  const seen = new Set()
  const normalized = []
  for (const entry of Array.isArray(recentFiles) ? recentFiles : []) {
    const path = String(entry?.path || '').trim()
    if (!path || seen.has(path)) continue
    seen.add(path)
    normalized.push({
      path,
      openedAt: Number(entry?.openedAt) || 0,
    })
    if (normalized.length >= 20) break
  }
  return normalized
}

function readLegacyRecentFiles(workspacePath = '') {
  if (!workspacePath) return []
  return normalizeRecentFiles(readStorageJson(recentFilesStorageKey(workspacePath), []))
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
  return normalizeRecentFiles(recentFiles)
}

export async function saveRecentFiles(workspaceDataDir = '', workspacePath = '', recentFiles = []) {
  const normalized = normalizeRecentFiles(recentFiles)
  if (!workspaceDataDir) return normalized

  const saved = await invoke('editor_recent_files_save', {
    params: {
      workspaceDataDir,
      recentFiles: normalized,
    },
  })
  clearLegacyRecentFiles(workspacePath)
  return normalizeRecentFiles(saved)
}
