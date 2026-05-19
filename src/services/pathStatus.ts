import { invokeCommand as invoke } from './tauriBridge.ts'

function missingPathStatus(path = '') {
  return {
    path: typeof path === 'string' ? path.trim() : '',
    exists: false,
    isDir: false,
    isFile: false,
    size: null,
    modified: null,
  }
}

export async function getPathStatus(path = '') {
  try {
    return await invoke('path_status', { path })
  } catch {
    return missingPathStatus(path)
  }
}

export async function getWorkspacePathStatus(path = '') {
  try {
    return await invoke('workspace_path_status', { path })
  } catch {
    return missingPathStatus(path)
  }
}

export async function pathExists(path = '') {
  return (await getPathStatus(path)).exists
}

export async function workspacePathExists(path = '') {
  return (await getWorkspacePathStatus(path)).exists
}
