import { invoke } from '@tauri-apps/api/core'
import { TEXT_FILE_READ_LIMIT_BYTES } from '../domains/files/workspaceTextFileLimits.js'

export async function readWorkspaceTextFile(path, maxBytes = TEXT_FILE_READ_LIMIT_BYTES) {
  return invoke('read_file', { path, maxBytes })
}

export async function readWorkspaceTextFileUnbounded(path) {
  return invoke('read_file', { path })
}

export async function saveWorkspaceTextFile(path, content) {
  await invoke('write_file', { path, content })
}
