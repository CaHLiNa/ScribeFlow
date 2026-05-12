import { invoke } from '@tauri-apps/api/core'

export async function executeExtensionCommand(payload = {}) {
  return invoke('extension_command_execute', {
    params: payload ?? {},
  })
}

export async function invokeExtensionCapability(payload = {}) {
  return invoke('extension_capability_invoke', {
    params: payload ?? {},
  })
}
