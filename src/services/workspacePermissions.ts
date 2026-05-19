import { invokeCommand as invoke } from './tauriBridge.ts'
import { isMac } from '../platform'

export function removeWorkspaceBookmark(path) {
  if (!path) return
  void invoke('workspace_bookmark_remove', {
    params: {
      path,
    },
  }).catch((error) => {
    console.warn('[workspace-permissions] Failed to remove workspace bookmark:', error)
  })
}

export async function captureWorkspaceBookmark(path) {
  if (!isMac || !path) return path
  try {
    const result = await invoke('macos_capture_workspace_bookmark', {
      params: {
        path,
      },
    })
    return result?.path || path
  } catch (error) {
    console.warn('[workspace-permissions] Failed to create workspace bookmark:', error)
    return path
  }
}

export async function activateWorkspaceBookmark(path) {
  if (!isMac || !path) return path

  try {
    const result = await invoke('macos_activate_workspace_bookmark_for_path', {
      params: {
        path,
      },
    })
    return result?.path || path
  } catch (error) {
    console.warn('[workspace-permissions] Failed to activate workspace bookmark:', error)
    return path
  }
}

export async function releaseWorkspaceBookmark(path) {
  if (!isMac || !path) return
  try {
    await invoke('macos_release_workspace_access', { path })
  } catch (error) {
    console.warn('[workspace-permissions] Failed to release workspace bookmark:', error)
  }
}
