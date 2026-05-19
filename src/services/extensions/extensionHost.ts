import { invokeCommand as invoke } from '../tauriBridge.ts'

export async function loadExtensionHostStatus() {
  return invoke('extension_host_status')
}

export async function activateExtensionHost(payload = {}) {
  return invoke('extension_host_activate', {
    params: payload ?? {},
  })
}

export async function deactivateExtensionHost(payload = {}) {
  return invoke('extension_host_deactivate', {
    params: payload ?? {},
  })
}

export async function cancelExtensionWindowInputs(payload = {}) {
  return invoke('extension_host_cancel_window_inputs', {
    params: payload ?? {},
  })
}

export async function updateExtensionHostSettings(payload = {}) {
  return invoke('extension_host_update_settings', {
    params: payload ?? {},
  })
}

export async function resolveExtensionHostCall(payload = {}) {
  return invoke('extension_host_resolve_host_call', {
    params: payload ?? {},
  })
}
