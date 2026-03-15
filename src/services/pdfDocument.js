import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { toWorkspaceProtocolUrl } from '../utils/workspaceProtocol'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url,
).href

export function createPdfLoadingTaskForWorkspace(path, workspace, options = {}) {
  const url = toWorkspaceProtocolUrl(path, workspace, options)
  if (!url) {
    throw new Error(`PDF path is outside the active workspace scope: ${path}`)
  }
  return pdfjsLib.getDocument({
    url,
    disableRange: true,
    disableStream: true,
  })
}

export async function openPdfExternalUrl(url) {
  const { open } = await import('@tauri-apps/plugin-shell')
  return open(url)
}
