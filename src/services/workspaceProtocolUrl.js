import { invoke } from '@tauri-apps/api/core'

export async function toWorkspaceProtocolUrl(filePath, workspace, options = {}) {
  return invoke('workspace_protocol_url_resolve', {
    params: {
      filePath,
      workspace,
      options,
    },
  })
}
