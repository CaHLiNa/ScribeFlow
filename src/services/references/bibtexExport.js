import { referenceRecordToCsl } from '../../domains/references/referenceInterop.js'

const CSL_TO_BIBTEX_TYPE = {
  'article-journal': 'article',
  'paper-conference': 'inproceedings',
  article: 'article',
  book: 'book',
  chapter: 'incollection',
  thesis: 'phdthesis',
  report: 'techreport',
  manuscript: 'unpublished',
}

function escapeBibtex(value = '') {
  return String(value || '').replace(/\n+/g, ' ').trim()
}

function cslTypeToBibtex(type = '') {
  return CSL_TO_BIBTEX_TYPE[String(type || '').trim()] || 'misc'
}

export function exportReferencesToBibTeX(references = []) {
  return references
    .map((reference) => exportReferenceToBibTeX(reference))
    .filter(Boolean)
    .join('\n\n')
}

export function exportReferenceToBibTeX(reference = {}) {
  const csl = referenceRecordToCsl(reference)
  const type = cslTypeToBibtex(csl.type)
  const key = csl._key || csl.id
  if (!key) return ''

  const fields = []
  if (csl.title) fields.push(`  title = {${escapeBibtex(csl.title)}}`)
  if (Array.isArray(csl.author) && csl.author.length > 0) {
    const authors = csl.author
      .map((author) => `${author.family || ''}${author.given ? `, ${author.given}` : ''}`.trim())
      .join(' and ')
    fields.push(`  author = {${escapeBibtex(authors)}}`)
  }
  if (csl.issued?.['date-parts']?.[0]?.[0]) {
    fields.push(`  year = {${csl.issued['date-parts'][0][0]}}`)
  }
  if (csl['container-title']) {
    const fieldName = csl.type === 'paper-conference' ? 'booktitle' : 'journal'
    fields.push(`  ${fieldName} = {${escapeBibtex(csl['container-title'])}}`)
  }
  if (csl.volume) fields.push(`  volume = {${escapeBibtex(csl.volume)}}`)
  if (csl.issue) fields.push(`  number = {${escapeBibtex(csl.issue)}}`)
  if (csl.page) fields.push(`  pages = {${escapeBibtex(String(csl.page).replace(/-/g, '--'))}}`)
  if (csl.DOI) fields.push(`  doi = {${escapeBibtex(csl.DOI)}}`)
  if (csl.URL) fields.push(`  url = {${escapeBibtex(csl.URL)}}`)
  if (csl.publisher) fields.push(`  publisher = {${escapeBibtex(csl.publisher)}}`)
  if (csl.abstract) fields.push(`  abstract = {${escapeBibtex(csl.abstract)}}`)

  return `@${type}{${key},\n${fields.join(',\n')}\n}`
}
