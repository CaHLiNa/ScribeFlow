import { invoke } from '@tauri-apps/api/core'

export async function formatWithCSL(styleId = '', mode = 'reference', cslItems = [], number, locale = 'en-GB') {
  if (!Array.isArray(cslItems) || cslItems.length === 0) return ''
  if (typeof window === 'undefined' || typeof window.__TAURI_INTERNALS__?.invoke !== 'function') {
    throw new Error('Tauri invoke is required for CSL formatting.')
  }

  const { useWorkspaceStore } = await import('../../stores/workspace.js')
  const workspace = useWorkspaceStore()
  return invoke('references_citation_format_csl', {
    params: {
      styleId,
      mode,
      cslItems,
      number,
      locale,
      workspacePath: String(workspace.projectDir || workspace.path || '').trim(),
    },
  })
}
