import { invoke } from '@tauri-apps/api/core'

export async function applyReferenceMutation(params = {}) {
  return invoke('references_mutation_apply', {
    params,
  })
}

export function resolveReferenceQuery(params = {}) {
  return invoke('references_query_resolve', {
    params,
  })
}

export function searchReferenceQuery(params = {}) {
  return invoke('references_query_search', {
    params,
  })
}

export function scanWorkspaceCitationStyles(workspacePath = '') {
  return invoke('references_scan_workspace_styles', {
    params: {
      workspacePath,
    },
  })
}

export function writeReferenceBibFile(texPath = '', references = [], citationStyle = 'apa', options = {}) {
  const params = {
    texPath,
    references,
    citationStyle,
  }
  if (Object.prototype.hasOwnProperty.call(options, 'documentReferenceSelections')) {
    params.documentReferenceSelections = options.documentReferenceSelections
  }
  return invoke('references_write_bib_file', {
    params,
  })
}
