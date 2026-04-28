import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export { getPathStatus, getWorkspacePathStatus, pathExists, workspacePathExists } from './pathStatus.js'

export function loadWorkspaceTreeState(params = {}) {
  return invoke('fs_tree_load_workspace_state', {
    params: {
      workspacePath: String(params.workspacePath || ''),
      currentTree: Array.isArray(params.currentTree) ? params.currentTree : [],
      extraDirs: Array.isArray(params.extraDirs) ? params.extraDirs : [],
      includeHidden: params.includeHidden !== false,
    },
  })
}

export function revealWorkspaceTreeState(params = {}) {
  return invoke('fs_tree_reveal_workspace_state', {
    params: {
      workspacePath: String(params.workspacePath || ''),
      targetPath: String(params.targetPath || ''),
      currentTree: Array.isArray(params.currentTree) ? params.currentTree : [],
      includeHidden: params.includeHidden !== false,
    },
  })
}

export function restoreCachedExpandedTreeState(params = {}) {
  return invoke('fs_tree_restore_cached_expanded_state', {
    params: {
      workspacePath: String(params.workspacePath || ''),
      currentTree: Array.isArray(params.currentTree) ? params.currentTree : [],
      cachedRootExpandedDirs: Array.isArray(params.cachedRootExpandedDirs)
        ? params.cachedRootExpandedDirs
        : [],
      maxDirs: Number.isFinite(params.maxDirs) ? params.maxDirs : 6,
      includeHidden: params.includeHidden !== false,
    },
  })
}

export function startWorkspaceTreeWatch(path) {
  return invoke('workspace_tree_watch_start', { path })
}

export function stopWorkspaceTreeWatch() {
  return invoke('workspace_tree_watch_stop')
}

export function setWorkspaceTreeWatchVisibility(path, visible) {
  return invoke('workspace_tree_watch_set_visibility', {
    params: {
      path,
      visible: visible === true,
    },
  })
}

export function noteWorkspaceTreeWatchActivity(path) {
  return invoke('workspace_tree_watch_note_activity', {
    params: {
      path,
    },
  })
}

export function listenWorkspaceTreeRefreshRequests(handler) {
  return listen('workspace-tree-refresh-requested', handler)
}

export async function revealPathInFileManager(entry) {
  return invoke('reveal_in_file_manager', { path: entry.path })
}

export async function listenNativeFileDropEvents(handlers) {
  const stopOver = await listen('tauri://drag-over', (event) => {
    handlers.onOver?.(event.payload)
  })
  const stopDrop = await listen('tauri://drag-drop', (event) => {
    handlers.onDrop?.(event.payload)
  })
  const stopLeave = await listen('tauri://drag-leave', (event) => {
    handlers.onLeave?.(event.payload)
  })

  return () => {
    stopOver?.()
    stopDrop?.()
    stopLeave?.()
  }
}
