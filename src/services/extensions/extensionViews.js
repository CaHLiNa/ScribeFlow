import { invoke } from '@tauri-apps/api/core'

export async function resolveExtensionView(payload = {}) {
  return invoke('extension_view_resolve', {
    params: payload ?? {},
  })
}

export async function notifyExtensionViewSelection(payload = {}) {
  return invoke('extension_host_notify_view_selection', {
    params: payload ?? {},
  })
}
