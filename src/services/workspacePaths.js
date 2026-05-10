import { invoke } from '@tauri-apps/api/core'
import { getHomeDir } from './appDirs.js'

let cachedHomeDir = undefined

export async function hashWorkspacePath(value = '') {
  return invoke('workspace_paths_hash', { value: String(value || '') })
}

export async function resolveWorkspaceDataDir(globalConfigDir = '', workspaceId = '') {
  return invoke('workspace_paths_resolve_data_dir', { globalConfigDir, workspaceId })
}

export async function resolveClaudeConfigDir(globalConfigDir = '') {
  return invoke('workspace_paths_resolve_claude_config_dir', { globalConfigDir })
}

export async function resolveSkillPath(projectDir = '', rawPath = '') {
  return invoke('workspace_paths_resolve_skill_path', { projectDir, rawPath })
}

export async function normalizePathValue(value = '') {
  return invoke('workspace_paths_normalize_value', { value })
}

export async function getHomeDirCached() {
  if (cachedHomeDir !== undefined) return cachedHomeDir
  try {
    const raw = await getHomeDir()
    cachedHomeDir = await normalizePathValue(raw)
  } catch {
    cachedHomeDir = ''
  }
  return cachedHomeDir
}
