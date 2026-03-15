import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
const MIME_BY_EXTENSION = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

export async function pickDocxImageDataUrl() {
  const path = await open({
    filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }],
  })
  if (!path) return null

  const base64 = await invoke('read_file_base64', { path })
  const extension = path.split('.').pop()?.toLowerCase() || 'png'
  const mime = MIME_BY_EXTENSION[extension] || 'image/png'
  return `data:${mime};base64,${base64}`
}
