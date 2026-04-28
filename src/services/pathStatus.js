import { invoke } from '@tauri-apps/api/core'

function normalizePathStatus(path = '', status = {}) {
  const normalizedPath = String(status?.path || path || '')
  const exists = status?.exists === true
  return {
    path: normalizedPath,
    exists,
    isDir: exists && status?.isDir === true,
    isFile: exists && status?.isFile === true,
    size: Number.isFinite(status?.size) ? status.size : null,
    modified: Number.isFinite(status?.modified) ? status.modified : null,
  }
}

export async function getPathStatus(path = '') {
  const normalizedPath = String(path || '').trim()
  if (!normalizedPath) return normalizePathStatus('')
  try {
    const status = await invoke('path_status', { path: normalizedPath })
    return normalizePathStatus(normalizedPath, status)
  } catch {
    return normalizePathStatus(normalizedPath)
  }
}

export async function getWorkspacePathStatus(path = '') {
  const normalizedPath = String(path || '').trim()
  if (!normalizedPath) return normalizePathStatus('')
  try {
    const status = await invoke('workspace_path_status', { path: normalizedPath })
    return normalizePathStatus(normalizedPath, status)
  } catch {
    return normalizePathStatus(normalizedPath)
  }
}

export async function pathExists(path = '') {
  return (await getPathStatus(path)).exists
}

export async function workspacePathExists(path = '') {
  return (await getWorkspacePathStatus(path)).exists
}
