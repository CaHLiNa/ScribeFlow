import { invoke } from '@tauri-apps/api/core'

export async function extractTextFromPdf(filePath = '') {
  return invoke('references_pdf_extract_text', {
    params: {
      filePath,
    },
  })
}

export async function extractPdfMetadata(filePath = '') {
  return invoke('references_pdf_extract_metadata', {
    params: {
      filePath,
    },
  })
}
