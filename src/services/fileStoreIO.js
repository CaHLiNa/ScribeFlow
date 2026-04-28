import { invoke } from '@tauri-apps/api/core'
import { TEXT_FILE_READ_LIMIT_BYTES } from '../domains/files/workspaceTextFileLimits.js'

export async function readWorkspaceTextFile(path, maxBytes = TEXT_FILE_READ_LIMIT_BYTES) {
  return invoke('read_file', { path, maxBytes })
}

export async function saveWorkspaceTextFile(path, content) {
  await writeTextFile(path, content)
}

export async function writeTextFile(path, content) {
  await invoke('write_file', { path, content })
}

export async function createWorkspaceFile(dirPath, name, options = {}) {
  return invoke('workspace_create_file', {
    dirPath,
    name,
    initialContent: typeof options.initialContent === 'string' ? options.initialContent : '',
  })
}

export async function duplicateWorkspacePath(path) {
  return invoke('workspace_duplicate_path', { path })
}

export async function createWorkspaceFolder(dirPath, name) {
  return invoke('workspace_create_dir', { dirPath, name })
}

export async function renameWorkspacePath(oldPath, newPath) {
  return invoke('workspace_rename_path', { oldPath, newPath })
}

export async function moveWorkspacePath(srcPath, destDir) {
  return invoke('workspace_move_path', { srcPath, destDir })
}

export async function copyExternalWorkspaceFile(srcPath, destDir) {
  return invoke('workspace_copy_external_path', { srcPath, destDir })
}

export async function deleteWorkspacePath(path) {
  return invoke('workspace_delete_path', { path })
}
