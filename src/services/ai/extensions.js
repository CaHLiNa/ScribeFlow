import { invoke } from '@tauri-apps/api/core'

export async function loadAiExtensionCatalog(workspacePath = '') {
  return invoke('ai_extension_catalog_load', {
    params: {
      workspacePath,
    },
  })
}

export async function probeAiExtensionMcpServer(workspacePath = '', serverId = '') {
  return invoke('ai_extension_mcp_probe', {
    params: {
      workspacePath,
      serverId,
    },
  })
}

export async function resolveAiExtensionRuntimeState(workspacePath = '') {
  return invoke('ai_extension_runtime_state_resolve', {
    params: {
      workspacePath,
    },
  })
}
