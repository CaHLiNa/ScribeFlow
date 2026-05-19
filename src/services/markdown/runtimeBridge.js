import { invokeCommand as invoke } from '../tauriBridge.ts'

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
  return invoke('markdown_extract_wiki_links', {
    params: { content },
  })
}

export async function resolveMarkdownLinkIndex(workspacePath = '', files = []) {
  return invoke('markdown_link_index_resolve', {
    params: { workspacePath, files },
  })
}
