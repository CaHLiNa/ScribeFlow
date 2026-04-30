import { invoke } from '@tauri-apps/api/core'

export async function resolveExtensionView(payload = {}) {
  return invoke('extension_view_resolve', {
    params: {
      globalConfigDir: String(payload.globalConfigDir || ''),
      workspaceRoot: String(payload.workspaceRoot || ''),
      extensionId: String(payload.extensionId || ''),
      viewId: String(payload.viewId || ''),
      commandId: String(payload.commandId || ''),
      targetKind: String(payload.targetKind || ''),
      targetPath: String(payload.targetPath || ''),
      settings: payload.settings || {},
    },
  })
}
