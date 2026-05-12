import {
  formatBibliography,
  formatCitation,
  formatCslBibliography,
  formatInlineCitation,
  formatReference,
} from './citationFormatter.js'
export {
  getAvailableCitationStyles,
  getCitationStyleInfo,
  normalizeCitationStyle,
} from './citationStyleRuntime.js'
import {
  getCitationStyleInfo,
  normalizeCitationStyle,
} from './citationStyleRuntime.js'

export function setUserCitationStyles() {
  // User styles are now managed on the Rust side
}

export async function getCitationStyleName(styleId = '') {
  const normalized = await normalizeCitationStyle(styleId)
  const info = await getCitationStyleInfo(normalized)
  return info?.name || 'APA 7th Edition'
}

export async function getCitationFormatter(styleId = 'apa', workspacePath = '') {
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
  if (mode === 'inline') {
    return formatCitation(styleId, 'inline', reference, number, workspacePath)
  }
  return formatCitation(styleId, 'reference', reference, number, workspacePath)
}

export async function formatBibliographyWithStyle(styleId = 'apa', references = [], workspacePath = '') {
  return formatBibliography(styleId, references, workspacePath)
}
