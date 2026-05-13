import { invoke } from '@tauri-apps/api/core'

export async function extractMarkdownHeadingItems(content = '') {
  return invoke('markdown_extract_headings', {
    params: { content },
  })
}

export async function extractMarkdownDraftProblems(content = '', sourcePath = '') {
  return invoke('markdown_extract_diagnostics', {
    params: { content, sourcePath },
  })
}

export async function extractMarkdownWikiLinks(content = '') {
  const links = await invoke('markdown_extract_wiki_links', {
    params: { content },
  })
  return Array.isArray(links) ? links : []
}

export async function resolveMarkdownLinkIndex(workspacePath = '', files = []) {
  const result = await invoke('markdown_link_index_resolve', {
    params: { workspacePath, files },
  })
  return result && typeof result === 'object'
    ? result
    : { forwardLinks: {}, backlinks: {}, nameMap: {}, headings: {} }
}
