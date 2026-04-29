import { invoke } from '@tauri-apps/api/core'

export function applyReferenceMutation(params = {}) {
  return invoke('references_mutation_apply', {
    params: {
      snapshot: params.snapshot && typeof params.snapshot === 'object' ? params.snapshot : {},
      action: params.action && typeof params.action === 'object' ? params.action : { type: '' },
    },
  })
}

export function resolveReferenceQuery(params = {}) {
  return invoke('references_query_resolve', {
    params: {
      librarySections: Array.isArray(params.librarySections) ? params.librarySections : [],
      sourceSections: Array.isArray(params.sourceSections) ? params.sourceSections : [],
      collections: Array.isArray(params.collections) ? params.collections : [],
      tags: Array.isArray(params.tags) ? params.tags : [],
      references: Array.isArray(params.references) ? params.references : [],
      selectedSectionKey: String(params.selectedSectionKey || ''),
      selectedSourceKey: String(params.selectedSourceKey || ''),
      selectedCollectionKey: String(params.selectedCollectionKey || ''),
      selectedTagKey: String(params.selectedTagKey || ''),
      sortKey: String(params.sortKey || ''),
      preferredSelectedReferenceId: String(params.preferredSelectedReferenceId || ''),
      fileContents: params.fileContents && typeof params.fileContents === 'object' ? params.fileContents : {},
    },
  })
}

export function scanWorkspaceCitationStyles(workspacePath = '') {
  return invoke('references_scan_workspace_styles', {
    params: {
      workspacePath: String(workspacePath || ''),
    },
  })
}

export function writeReferenceBibFile(texPath = '', references = [], citationStyle = 'apa') {
  return invoke('references_write_bib_file', {
    params: {
      texPath: String(texPath || ''),
      references: Array.isArray(references) ? references : [],
      citationStyle: String(citationStyle || 'apa'),
    },
  })
}
