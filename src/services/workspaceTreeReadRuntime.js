import { invoke } from '@tauri-apps/api/core'

export async function readDirShallow(path = '', options = {}) {
  return invoke('read_dir_shallow', {
    path: String(path || ''),
    includeHidden: options.includeHidden !== false,
  })
}
