import { invoke } from '@tauri-apps/api/core'
import { isNativeDesktopRuntime } from './runtimeGuard.js'

export function getHomeDir() {
  if (!isNativeDesktopRuntime()) return Promise.resolve('')
  return invoke('get_home_dir')
}

export function getGlobalConfigDir() {
  if (!isNativeDesktopRuntime()) return Promise.resolve('')
  return invoke('get_global_config_dir')
}
