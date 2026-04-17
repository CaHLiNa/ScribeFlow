import { invoke } from '@tauri-apps/api/core'

function requireTauriInvoke() {
  if (typeof window === 'undefined' || typeof window.__TAURI_INTERNALS__?.invoke !== 'function') {
    throw new Error('Tauri invoke is required for PDF metadata extraction.')
  }
}

export async function extractTextFromPdf(filePath = '') {
  requireTauriInvoke()
  return invoke('references_pdf_extract_text', {
    params: {
      filePath,
    },
  })
}

export async function extractPdfMetadata(filePath = '') {
  requireTauriInvoke()
  return invoke('references_pdf_extract_metadata', {
    params: {
      filePath,
    },
  })
}
