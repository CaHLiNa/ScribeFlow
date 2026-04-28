import { invoke } from '@tauri-apps/api/core'

export function getHomeDir() {
  return invoke('get_home_dir')
}

export function getGlobalConfigDir() {
  return invoke('get_global_config_dir')
}
