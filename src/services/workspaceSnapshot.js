import { invoke } from '@tauri-apps/api/core'

export async function listWorkspaceFlatFileEntries(snapshot = null, options = {}) {
  const includeDirectories = options?.includeDirectories === true
  return invoke('workspace_snapshot_list_flat_files', { snapshot: snapshot || {}, includeDirectories })
}

export async function listWorkspaceFlatFilePaths(snapshot = null) {
  const entries = await listWorkspaceFlatFileEntries(snapshot)
  return entries.map((entry) => entry.path)
}

export async function filterWorkspaceFlatFilesByExtension(snapshot = null, extensions = []) {
  return invoke('workspace_snapshot_filter_by_extension', { snapshot: snapshot || {}, extensions })
}

export async function countWorkspaceFlatFilesByExtension(snapshot = null, extensions = []) {
  return invoke('workspace_snapshot_count_by_extension', { snapshot: snapshot || {}, extensions })
}

export async function filterExistingRecentFiles(recentFiles = [], snapshot = null) {
  return invoke('workspace_snapshot_filter_existing_recent', { recentFiles, snapshot: snapshot || {} })
}
