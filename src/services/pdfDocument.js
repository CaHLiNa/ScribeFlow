import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { invoke } from '@tauri-apps/api/core'
import { toWorkspaceProtocolUrl } from '../utils/workspaceProtocol'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url,
).href

function isTauriDesktop() {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

async function resolvePdfDocumentSource(path, workspace, options = {}) {
  if (isTauriDesktop()) {
    const bytes = await invoke('read_file_binary', { path })
    return {
      data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    }
  }

  const url = toWorkspaceProtocolUrl(path, workspace, options)
  if (!url) {
    throw new Error(`PDF path is outside the active workspace scope: ${path}`)
  }
  return { url }
}

export async function createPdfLoadingTaskForWorkspace(path, workspace, options = {}) {
  const source = await resolvePdfDocumentSource(path, workspace, options)
  return pdfjsLib.getDocument({
    ...source,
    disableRange: true,
    disableStream: true,
  })
}

export async function openPdfExternalUrl(url) {
  const { open } = await import('@tauri-apps/plugin-shell')
  return open(url)
}
