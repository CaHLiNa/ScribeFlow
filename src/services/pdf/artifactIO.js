import { invoke } from '@tauri-apps/api/core'

export async function readPdfArtifactBase64(filePath) {
  const normalizedPath = String(filePath || '').trim()
  if (!normalizedPath) return ''

  return invoke('read_file_base64', { path: normalizedPath })
}

export async function writePdfArtifactBase64(filePath, data) {
  const normalizedPath = String(filePath || '').trim()
  const normalizedData = String(data || '')
  if (!normalizedPath || !normalizedData) return

  return invoke('write_file_base64', {
    path: normalizedPath,
    data: normalizedData,
  })
}
