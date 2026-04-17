import { invoke } from '@tauri-apps/api/core'

function requireTauriInvoke() {
  if (typeof window === 'undefined' || typeof window.__TAURI_INTERNALS__?.invoke !== 'function') {
    throw new Error('Tauri invoke is required for BibTeX export.')
  }
}

export async function exportReferencesToBibTeX(references = []) {
  requireTauriInvoke()
  return invoke('references_export_bibtex', {
    params: {
      references,
    },
  })
}
