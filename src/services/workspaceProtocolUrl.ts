import { invokeCommand as invoke } from './tauriBridge.ts'

export async function toWorkspaceProtocolUrl(filePath, workspace, options = {}) {
  return invoke('workspace_protocol_url_resolve', {
    params: {
      filePath,
      workspace,
      options,
    },
  })
}
