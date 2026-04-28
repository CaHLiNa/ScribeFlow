import { invoke } from '@tauri-apps/api/core'
import { isMac } from '../platform'
import {
  clearLegacyWorkspaceBookmarks,
  normalizeWorkspaceBookmarkPath,
  readLegacyWorkspaceBookmarks,
} from './workspaceBookmarkState.js'

export function removeWorkspaceBookmark(path) {
  if (!path) return
  void invoke('workspace_bookmark_remove', {
    params: {
      path: normalizeWorkspaceBookmarkPath(path),
    },
  }).then(clearLegacyWorkspaceBookmarks).catch((error) => {
    console.warn('[workspace-permissions] Failed to remove workspace bookmark:', error)
  })
}

export async function captureWorkspaceBookmark(path) {
  if (!isMac || !path) return path
  try {
    const normalizedPath = normalizeWorkspaceBookmarkPath(path)
    const result = await invoke('macos_capture_workspace_bookmark', {
      params: {
        path: normalizedPath,
        legacyBookmarks: readLegacyWorkspaceBookmarks(),
      },
    })
    clearLegacyWorkspaceBookmarks()
    return normalizeWorkspaceBookmarkPath(result?.path || normalizedPath)
  } catch (error) {
    console.warn('[workspace-permissions] Failed to create workspace bookmark:', error)
    return normalizeWorkspaceBookmarkPath(path)
  }
}

export async function activateWorkspaceBookmark(path) {
  const normalizedPath = normalizeWorkspaceBookmarkPath(path)
  if (!isMac || !normalizedPath) return normalizedPath

  try {
    const result = await invoke('macos_activate_workspace_bookmark_for_path', {
      params: {
        path: normalizedPath,
        legacyBookmarks: readLegacyWorkspaceBookmarks(),
      },
    })
    clearLegacyWorkspaceBookmarks()
    return normalizeWorkspaceBookmarkPath(result?.path || normalizedPath)
  } catch (error) {
    console.warn('[workspace-permissions] Failed to activate workspace bookmark:', error)
    return normalizedPath
  }
}

export async function releaseWorkspaceBookmark(path) {
  if (!isMac || !path) return
  try {
    await invoke('macos_release_workspace_access', { path: normalizeWorkspaceBookmarkPath(path) })
  } catch (error) {
    console.warn('[workspace-permissions] Failed to release workspace bookmark:', error)
  }
}
