import { referenceRecordToCsl } from '../../domains/references/referenceInterop.js'
import {
  formatCslBibliography as fastFormatBibliography,
  formatInlineCitation as fastFormatInlineCitation,
  formatReference as fastFormatReference,
  isFastCitationStyle,
} from './citationFormatter.js'

const BUILTIN_STYLES = [
  { id: 'apa', name: 'APA 7th Edition', category: 'Author-date', fast: true },
  { id: 'chicago', name: 'Chicago Author-Date', category: 'Author-date', fast: true },
  { id: 'harvard', name: 'Harvard', category: 'Author-date', fast: true },
  { id: 'ieee', name: 'IEEE', category: 'Numeric', fast: true },
  { id: 'vancouver', name: 'Vancouver', category: 'Numeric', fast: true },
  { id: 'apa-6th-edition', name: 'APA 6th Edition', category: 'Author-date', fast: false },
  { id: 'american-sociological-association', name: 'American Sociological Association', category: 'Author-date', fast: false },
  { id: 'chicago-note-bibliography', name: 'Chicago Notes & Bibliography', category: 'Note', fast: false },
  { id: 'modern-language-association', name: 'MLA 9th Edition', category: 'Note', fast: false },
  { id: 'nature', name: 'Nature', category: 'Numeric', fast: false },
  { id: 'science', name: 'Science', category: 'Numeric', fast: false },
  { id: 'cell', name: 'Cell', category: 'Numeric', fast: false },
  { id: 'plos-one', name: 'PLOS ONE', category: 'Numeric', fast: false },
  { id: 'springer-lecture-notes-in-computer-science', name: 'Springer LNCS', category: 'Numeric', fast: false },
  { id: 'american-chemical-society', name: 'ACS', category: 'Numeric', fast: false },
  { id: 'american-medical-association', name: 'AMA', category: 'Numeric', fast: false },
  { id: 'annual-reviews', name: 'Annual Reviews', category: 'Numeric', fast: false },
  { id: 'royal-society-of-chemistry', name: 'Royal Society of Chemistry', category: 'Numeric', fast: false },
  { id: 'elsevier-with-titles', name: 'Elsevier (with titles)', category: 'Numeric', fast: false },
  { id: 'elsevier-harvard', name: 'Elsevier Harvard', category: 'Author-date', fast: false },
  { id: 'harvard-cite-them-right', name: 'Harvard Cite Them Right', category: 'Author-date', fast: false },
  { id: 'the-lancet', name: 'The Lancet', category: 'Numeric', fast: false },
  { id: 'bmj', name: 'BMJ', category: 'Numeric', fast: false },
  { id: 'proceedings-of-the-national-academy-of-sciences', name: 'PNAS', category: 'Numeric', fast: false },
  { id: 'american-institute-of-physics', name: 'AIP', category: 'Numeric', fast: false },
  { id: 'american-mathematical-society', name: 'AMS', category: 'Numeric', fast: false },
  { id: 'din-1505-2', name: 'DIN 1505-2', category: 'Author-date', fast: false },
  { id: 'china-national-standard-gb-t-7714-2015-author-date', name: 'GB/T 7714-2015 (Author-date)', category: 'Author-date', fast: false },
  { id: 'china-national-standard-gb-t-7714-2015-numeric', name: 'GB/T 7714-2015 (Numeric)', category: 'Numeric', fast: false },
  { id: 'oscola', name: 'OSCOLA', category: 'Note', fast: false },
  { id: 'bluebook-law-review', name: 'Bluebook', category: 'Note', fast: false },
  { id: 'modern-humanities-research-association', name: 'MHRA', category: 'Note', fast: false },
]

let userStyles = []

export function getAvailableCitationStyles() {
  return [...BUILTIN_STYLES, ...userStyles]
}

export function getCitationStyleInfo(styleId = '') {
  return getAvailableCitationStyles().find((style) => style.id === styleId) || null
}

export function setUserCitationStyles(styles = []) {
  userStyles = styles.map((style) => ({
    ...style,
    fast: false,
    isCustom: true,
  }))
}

export function getCitationStyleName(styleId = '') {
  return getCitationStyleInfo(styleId)?.name || styleId || 'APA 7th Edition'
}

export function citationStyleUsesFastPath(styleId = '') {
  const style = getCitationStyleInfo(styleId)
  if (!style) return isFastCitationStyle(styleId)
  return style.fast === true
}

export function getCitationFormatter(styleId = 'apa') {
  if (citationStyleUsesFastPath(styleId)) {
    return {
      isAsync: false,
      formatReference: (csl, number) => fastFormatReference(csl, styleId, number),
      formatInlineCitation: (csl, number) => fastFormatInlineCitation(csl, styleId, number),
      formatBibliography: (cslRecords) => fastFormatBibliography(cslRecords, styleId),
    }
  }

  return {
    isAsync: true,
    formatReference: async (csl, number) => {
      const { formatWithCSL } = await import('./citationFormatterCSL.js')
      return formatWithCSL(styleId, 'reference', [csl], number)
    },
    formatInlineCitation: async (csl, number) => {
      const { formatWithCSL } = await import('./citationFormatterCSL.js')
      return formatWithCSL(styleId, 'inline', [csl], number)
    },
    formatBibliography: async (cslRecords) => {
      const { formatWithCSL } = await import('./citationFormatterCSL.js')
      return formatWithCSL(styleId, 'bibliography', cslRecords)
    },
  }
}

export async function formatCitationWithStyle(styleId = 'apa', mode = 'reference', reference = {}, number) {
  const formatter = getCitationFormatter(styleId)
  const csl = referenceRecordToCsl(reference)

  if (mode === 'inline') {
    return formatter.formatInlineCitation(csl, number)
  }
  return formatter.formatReference(csl, number)
}

export async function formatBibliographyWithStyle(styleId = 'apa', references = []) {
  const formatter = getCitationFormatter(styleId)
  const cslRecords = references.map((reference) => referenceRecordToCsl(reference))
  return formatter.formatBibliography(cslRecords)
}

