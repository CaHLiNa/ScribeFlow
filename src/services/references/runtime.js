import { invoke } from '@tauri-apps/api/core'

export async function applyReferenceMutation(params = {}) {
  return invoke('references_mutation_apply', {
    params: {
      snapshot: params.snapshot && typeof params.snapshot === 'object' ? params.snapshot : {},
      action: params.action && typeof params.action === 'object' ? params.action : { type: '' },
    },
  })
}

export async function resolveReferenceQuery(params = {}) {
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
      searchQuery: String(params.searchQuery || ''),
      sortKey: String(params.sortKey || ''),
      preferredSelectedReferenceId: String(params.preferredSelectedReferenceId || ''),
      fileContents: params.fileContents && typeof params.fileContents === 'object'
        ? params.fileContents
        : {},
    },
  })
}

export async function scanWorkspaceCitationStyles(workspacePath = '') {
  return invoke('references_scan_workspace_styles', {
    params: {
      workspacePath: String(workspacePath || ''),
    },
  })
}
