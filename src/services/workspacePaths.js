import { invokeCommand as invoke } from './tauriBridge.ts'
import { getHomeDir } from './appDirs.js'

let cachedHomeDir = undefined

export async function hashWorkspacePath(value = '') {
  return invoke('workspace_paths_hash', { params: { value } })
}

export async function resolveWorkspaceDataDir(globalConfigDir = '', workspaceId = '') {
  return invoke('workspace_paths_resolve_data_dir', { params: { globalConfigDir, workspaceId } })
}

export async function resolveClaudeConfigDir(globalConfigDir = '') {
  return invoke('workspace_paths_resolve_claude_config_dir', { params: { globalConfigDir } })
}

export async function resolveSkillPath(projectDir = '', rawPath = '') {
  return invoke('workspace_paths_resolve_skill_path', { params: { projectDir, rawPath } })
}

export async function normalizePathValue(value = '') {
  return invoke('workspace_paths_normalize_value', { params: { value } })
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
