import { invoke } from '@tauri-apps/api/core'
import { detectTauriDesktopRuntime, isMac } from '../platform'

export function syncMacosWindowTransparency() {
  if (!isMac || !detectTauriDesktopRuntime()) return Promise.resolve()
  return invoke('macos_sync_window_transparency')
}
