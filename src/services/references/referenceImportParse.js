import { invoke } from '@tauri-apps/api/core'

async function parseReferenceImportContent(content = '', format = 'auto') {
  const parsed = await invoke('references_import_parse_text', {
    params: {
      content,
      format,
    },
  })
  return Array.isArray(parsed) ? parsed : []
}

export async function parseBibTeXText(content = '') {
  return parseReferenceImportContent(content, 'bibtex')
}

export async function parseRisText(content = '') {
  return parseReferenceImportContent(content, 'ris')
}

export async function parseCSLJSONText(content = '') {
  return parseReferenceImportContent(content, 'csl-json')
}

export async function parseReferenceImportText(content = '', format = 'auto') {
  return parseReferenceImportContent(content, format)
}
