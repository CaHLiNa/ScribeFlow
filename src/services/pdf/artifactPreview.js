import { invoke } from '@tauri-apps/api/core'
import { requestLatexWorkshopBackwardSync } from '../latex/latexWorkshopSynctex.js'

export async function readPdfArtifactBase64(filePath) {
  const normalizedPath = String(filePath || '').trim()
  if (!normalizedPath) return ''

  return invoke('read_file_base64', { path: normalizedPath })
}

export async function requestLatexPdfForwardSync(options = {}) {
  const synctexPath = String(options.synctexPath || '').trim()
  const texPath = String(options.texPath || '').trim()
  const line = Number(options.line || 0)
  const column = Number(options.column || 0)
  if (!synctexPath || !texPath || !Number.isInteger(line) || line < 1) return null

  return invoke('synctex_forward', {
    synctexPath,
    texPath,
    line,
    column: Number.isInteger(column) && column >= 0 ? column : 0,
  })
}

export async function requestLatexPdfBackwardSync(options = {}) {
  const synctexPath = String(options.synctexPath || '').trim()
  const page = Number(options.page || 0)
  const x = Number(options.x)
  const y = Number(options.y)
  if (
    !synctexPath
    || !Number.isInteger(page)
    || page < 1
    || !Number.isFinite(x)
    || !Number.isFinite(y)
  ) {
    return null
  }

  return requestLatexWorkshopBackwardSync({
    synctexPath,
    page,
    x,
    y,
  })
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
