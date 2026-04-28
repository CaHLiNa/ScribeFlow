import { invoke } from '@tauri-apps/api/core'

export async function detectReferenceImportFormat(content = '') {
  return invoke('references_import_detect_format', {
    params: {
      content,
    },
  })
}
