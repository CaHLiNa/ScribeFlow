import { invoke } from '@tauri-apps/api/core'
import {
  requestLatexWorkshopBackwardSync,
  requestLatexWorkshopForwardSync,
} from '../latex/latexWorkshopSynctex.js'
import { resolveLatexSynctexInputPath } from '../latex/synctex.js'

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

  const effectiveTexPath = await resolveLatexSynctexInputPath(synctexPath, texPath)

  try {
    return await invoke('synctex_forward', {
      synctexPath,
      texPath: effectiveTexPath,
      line,
      column: Number.isInteger(column) && column >= 0 ? column : 0,
    })
  } catch {
    return requestLatexWorkshopForwardSync({
      synctexPath,
      texPath: effectiveTexPath,
      line,
    })
  }
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

  try {
    const result = await invoke('synctex_backward', {
      synctexPath,
      page,
      x,
      y,
    })
    if (result) {
      return {
        ...result,
        strictLine: true,
      }
    }
  } catch {
    // Fall back to the local parser when the SyncTeX binary is unavailable or
    // cannot resolve this position on the current machine.
  }

  const fallbackResult = await requestLatexWorkshopBackwardSync({
    synctexPath,
    page,
    x,
    y,
  })
  if (!fallbackResult) return null
  return {
    ...fallbackResult,
    strictLine: false,
  }
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
