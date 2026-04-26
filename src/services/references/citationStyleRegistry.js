import {
  formatCitation,
  formatCslBibliography,
  formatBibliography,
  formatInlineCitation,
  formatReference,
} from './citationFormatter.js'

const BUILTIN_STYLES = [
  { id: 'apa', name: 'APA 7th Edition', category: 'Author-date', fast: true },
  { id: 'chicago', name: 'Chicago Author-Date', category: 'Author-date', fast: true },
  { id: 'harvard', name: 'Harvard', category: 'Author-date', fast: true },
  { id: 'ieee', name: 'IEEE', category: 'Numeric', fast: true },
  { id: 'vancouver', name: 'Vancouver', category: 'Numeric', fast: true },
]

let userStyles = []

export function getAvailableCitationStyles() {
  return [...BUILTIN_STYLES, ...userStyles]
}

export function getCitationStyleInfo(styleId = '') {
  return getAvailableCitationStyles().find((style) => style.id === styleId) || null
}

export function normalizeCitationStyle(styleId = '') {
  const normalized = String(styleId || '').trim()
  if (!normalized) return 'apa'
  return getCitationStyleInfo(normalized)?.id || 'apa'
}

export function setUserCitationStyles(styles = []) {
  userStyles = styles.map((style) => ({
    ...style,
    fast: false,
    isCustom: true,
  }))
}

export function getCitationStyleName(styleId = '') {
  return getCitationStyleInfo(normalizeCitationStyle(styleId))?.name || 'APA 7th Edition'
}

export async function getCitationFormatter(styleId = 'apa') {
  return {
    isAsync: true,
    formatReference: async (csl, number) => formatReference(csl, styleId, number),
    formatInlineCitation: async (csl, number) => formatInlineCitation(csl, styleId, number),
    formatBibliography: async (cslRecords) => formatCslBibliography(cslRecords, styleId),
  }
}

export async function formatCitationWithStyle(styleId = 'apa', mode = 'reference', reference = {}, number) {
  if (mode === 'inline') {
    return formatCitation(styleId, 'inline', reference, number)
  }
  return formatCitation(styleId, 'reference', reference, number)
}

export async function formatBibliographyWithStyle(styleId = 'apa', references = []) {
  return formatBibliography(styleId, references)
}
