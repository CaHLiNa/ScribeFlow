import { invoke } from '@tauri-apps/api/core'

export async function resolveDocumentOutlineItems(filePath, options = {}) {
  const filesStore = options?.filesStore

  return invoke('document_outline_resolve', {
    params: {
      filePath,
      content: options?.content,
      workspacePath: options?.workspacePath,
      flatFiles: options?.flatFiles,
      snapshotFlatFiles: filesStore?.lastWorkspaceSnapshot?.flatFiles,
      cachedFlatFiles: filesStore?.flatFiles,
      contentOverrides: options?.contentOverrides,
    },
  })
}
