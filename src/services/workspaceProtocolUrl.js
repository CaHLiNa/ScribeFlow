import { invoke } from '@tauri-apps/api/core'

export async function toWorkspaceProtocolUrl(filePath, workspace, options = {}) {
  const workspacePath = workspace?.path || ''
  const workspaceDataDir = workspace?.workspaceDataDir || ''
  const globalConfigDir = workspace?.globalConfigDir || ''
  const version = options?.version || ''
  return invoke('workspace_protocol_url_resolve', {
    filePath,
    workspacePath,
    workspaceDataDir,
    globalConfigDir,
    version,
  })
}
