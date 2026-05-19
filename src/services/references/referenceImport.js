import { invokeCommand as invoke } from '../tauriBridge.ts'

export async function parseBibTeXText(content = '') {
  return invoke('references_import_parse_text', {
    params: {
      content,
      format: 'bibtex',
    },
  })
}

export async function parseRisText(content = '') {
  return invoke('references_import_parse_text', {
    params: {
      content,
      format: 'ris',
    },
  })
}

export async function parseCSLJSONText(content = '') {
  return invoke('references_import_parse_text', {
    params: {
      content,
      format: 'csl-json',
    },
  })
}

export async function detectReferenceImportFormat(content = '') {
  return invoke('references_import_detect_format', {
    params: {
      content,
    },
  })
}

export async function parseReferenceImportText(content = '', format = 'auto') {
  return invoke('references_import_parse_text', {
    params: {
      content,
      format,
    },
  })
}

export async function parseReferenceImportFile(filePath = '', format = 'auto') {
  return invoke('references_import_parse_file', {
    params: {
      filePath,
      format,
    },
  })
}

export async function importReferencesFromText(content = '') {
  return invoke('references_import_from_text', {
    params: {
      content,
      format: 'auto',
    },
  })
}

export async function importReferenceFromPdf(filePath = '') {
  return invoke('references_import_pdf', {
    params: {
      filePath,
    },
  })
}

export async function findDuplicateReference(existing = [], candidate = {}) {
  return invoke('references_find_duplicate', {
    params: {
      existing,
      candidate,
    },
  })
}

export async function mergeImportedReferences(existing = [], imported = []) {
  return invoke('references_merge_imported', {
    params: {
      existing,
      imported,
    },
  })
}
