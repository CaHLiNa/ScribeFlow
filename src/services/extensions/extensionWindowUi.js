import { invokeCommand as invoke } from '../tauriBridge.ts'

export async function respondExtensionWindowUiRequest(payload = {}) {
  return invoke('extension_host_respond_ui_request', {
    params: payload ?? {},
  })
}
