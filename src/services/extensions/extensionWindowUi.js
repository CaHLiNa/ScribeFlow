import { invoke } from '@tauri-apps/api/core'

export async function respondExtensionWindowUiRequest(payload = {}) {
  return invoke('extension_host_respond_ui_request', {
    params: payload ?? {},
  })
}
