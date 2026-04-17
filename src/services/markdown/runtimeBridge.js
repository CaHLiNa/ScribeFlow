import { invoke } from '@tauri-apps/api/core'

function requireTauriInvoke() {
  if (typeof window === 'undefined' || typeof window.__TAURI_INTERNALS__?.invoke !== 'function') {
    throw new Error('Tauri invoke is required for Markdown runtime commands.')
  }
}

export async function extractMarkdownHeadingItems(content = '') {
  requireTauriInvoke()
  return invoke('markdown_extract_headings', {
    content: String(content || ''),
  })
}
