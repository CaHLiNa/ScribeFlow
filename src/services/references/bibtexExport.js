import { invoke } from '@tauri-apps/api/core'

export async function exportReferencesToBibTeX(references = []) {
  return invoke('references_export_bibtex', {
    params: {
      references,
    },
  })
}

export async function writeReferenceBibTeXExport(filePath = '', references = []) {
  return invoke('references_write_export_file', {
    params: {
      filePath,
      exportKind: 'bibtex',
      references,
    },
  })
}

export async function writeReferenceJsonExport(filePath = '', reference = {}) {
  return invoke('references_write_export_file', {
    params: {
      filePath,
      exportKind: 'reference-json',
      references: [reference],
    },
  })
}
