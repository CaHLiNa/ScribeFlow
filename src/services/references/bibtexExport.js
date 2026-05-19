import { invokeCommand as invoke } from '../tauriBridge.ts'

export async function exportReferencesToBibTeX(references = [], referenceIds = []) {
  return invoke('references_export_bibtex', {
    params: {
      references,
      referenceIds: Array.isArray(referenceIds) ? referenceIds : [],
    },
  })
}

export async function writeReferenceBibTeXExport(filePath = '', references = [], referenceIds = []) {
  return invoke('references_write_export_file', {
    params: {
      filePath,
      exportKind: 'bibtex',
      references,
      referenceIds: Array.isArray(referenceIds) ? referenceIds : [],
    },
  })
}

export async function writeReferenceJsonExport(filePath = '', references = [], referenceId = '') {
  return invoke('references_write_export_file', {
    params: {
      filePath,
      exportKind: 'reference-json',
      references: Array.isArray(references) ? references : [],
      referenceId,
    },
  })
}
