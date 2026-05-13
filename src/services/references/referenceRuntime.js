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

export function scanWorkspaceCitationStyles(workspacePath = '') {
  return invoke('references_scan_workspace_styles', {
    params: {
      workspacePath,
    },
  })
}

export function writeReferenceBibFile(texPath = '', references = [], citationStyle = 'apa') {
  return invoke('references_write_bib_file', {
    params: {
      texPath,
      references,
      citationStyle,
    },
  })
}
