export { isFastCitationStyle } from './citationFormatterState.js'
import {
  renderBibliography as renderBibliographyRuntime,
  renderCitationFromCsl,
  renderCitationFromReference,
} from './citationRenderRuntime.js'

export async function formatReference(csl = {}, style = 'apa', number) {
  return renderCitationFromCsl(style, 'reference', [csl], number)
}

export async function formatInlineCitation(csl = {}, style = 'apa', number) {
  return renderCitationFromCsl(style, 'inline', [csl], number)
}

export async function formatCslBibliography(cslRecords = [], style = 'apa') {
  return renderCitationFromCsl(style, 'bibliography', cslRecords)
}

export async function formatCitation(style = 'apa', mode = 'reference', reference = {}, number) {
  return renderCitationFromReference(style, mode, reference, number)
}

export async function formatBibliography(style = 'apa', references = []) {
  return renderBibliographyRuntime(style, references)
}
