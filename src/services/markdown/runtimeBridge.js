import { invoke } from '@tauri-apps/api/core'

export async function extractMarkdownHeadingItems(content = '') {
  return invoke('markdown_extract_headings', {
    content: String(content || ''),
  })
}

export async function extractMarkdownDraftProblems(content = '', sourcePath = '') {
  return invoke('markdown_extract_diagnostics', {
    content: String(content || ''),
    sourcePath: String(sourcePath || ''),
  })
}

export async function extractMarkdownWikiLinks(content = '') {
  const links = await invoke('markdown_extract_wiki_links', {
    content: String(content || ''),
  })
  return Array.isArray(links) ? links : []
}

export async function resolveMarkdownLinkIndex(workspacePath = '', files = []) {
  const result = await invoke('markdown_link_index_resolve', {
    workspacePath: String(workspacePath || ''),
    files: Array.isArray(files)
      ? files.map((file) => ({
        path: String(file?.path || ''),
        content: String(file?.content || ''),
      }))
      : [],
  })
  return result && typeof result === 'object'
    ? result
    : { forwardLinks: {}, backlinks: {}, nameMap: {}, headings: {} }
}
