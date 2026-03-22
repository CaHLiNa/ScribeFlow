import { invoke } from '@tauri-apps/api/core'

export async function pathExists(path = '') {
  if (!path) return false
  try {
    return await invoke('path_exists', { path })
  } catch {
    return false
  }
}
