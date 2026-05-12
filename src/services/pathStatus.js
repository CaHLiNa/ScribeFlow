import { invoke } from '@tauri-apps/api/core'

function normalizePathStatus(path = '', status = {}) {
  const hasStatusPath = Object.prototype.hasOwnProperty.call(status || {}, 'path')
  const normalizedPath = hasStatusPath ? String(status?.path || '') : String(path || '')
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
  try {
    const status = await invoke('path_status', { path })
    return normalizePathStatus(path, status)
  } catch {
    return normalizePathStatus(path)
  }
}

export async function getWorkspacePathStatus(path = '') {
  try {
    const status = await invoke('workspace_path_status', { path })
    return normalizePathStatus(path, status)
  } catch {
    return normalizePathStatus(path)
  }
}

export async function pathExists(path = '') {
  return (await getPathStatus(path)).exists
}

export async function workspacePathExists(path = '') {
  return (await getWorkspacePathStatus(path)).exists
}
