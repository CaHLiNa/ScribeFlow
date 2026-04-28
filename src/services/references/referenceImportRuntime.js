import { invoke } from '@tauri-apps/api/core'

export async function importReferencesFromText(content = '') {
  const trimmed = String(content || '').trim()
  if (!trimmed) return []
  const imported = await invoke('references_import_from_text', {
    params: {
      content: trimmed,
      format: 'auto',
    },
  })
  return Array.isArray(imported) ? imported : []
}

export async function importReferenceFromPdf(filePath = '') {
  const imported = await invoke('references_import_pdf', {
    params: {
      filePath,
    },
  })
  return imported && typeof imported === 'object' ? imported : null
}
