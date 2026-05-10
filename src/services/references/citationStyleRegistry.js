import { invoke } from '@tauri-apps/api/core'

export async function getAvailableCitationStyles() {
  return invoke('citation_style_list_available')
}

export async function getCitationStyleInfo(styleId = '') {
  return invoke('citation_style_get_info', { styleId })
}

export async function normalizeCitationStyle(styleId = '') {
  return invoke('citation_style_normalize', { styleId })
}

export function setUserCitationStyles() {
  // User styles are now managed on the Rust side
}

export async function getCitationStyleName(styleId = '') {
  const normalized = await normalizeCitationStyle(styleId)
  const info = await getCitationStyleInfo(normalized)
  return info?.name || 'APA 7th Edition'
}

export async function getCitationFormatter(styleId = 'apa', workspacePath = '') {
  const { formatReference, formatInlineCitation, formatCslBibliography } = await import('./citationFormatter.js')
  return {
    isAsync: true,
    formatReference: async (csl, number) => formatReference(csl, styleId, number, workspacePath),
    formatInlineCitation: async (csl, number) => formatInlineCitation(csl, styleId, number, workspacePath),
    formatBibliography: async (cslRecords) => formatCslBibliography(cslRecords, styleId, workspacePath),
  }
}

export async function formatCitationWithStyle(
  styleId = 'apa',
  mode = 'reference',
  reference = {},
  number,
  workspacePath = ''
) {
  const { formatCitation } = await import('./citationFormatter.js')
  if (mode === 'inline') {
    return formatCitation(styleId, 'inline', reference, number, workspacePath)
  }
  return formatCitation(styleId, 'reference', reference, number, workspacePath)
}

export async function formatBibliographyWithStyle(styleId = 'apa', references = [], workspacePath = '') {
  const { formatBibliography } = await import('./citationFormatter.js')
  return formatBibliography(styleId, references, workspacePath)
}
