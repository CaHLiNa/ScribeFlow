import { referenceRecordToCsl } from '../../domains/references/referenceInterop.js'

function getYear(csl = {}) {
  return csl.issued?.['date-parts']?.[0]?.[0] || 'n.d.'
}

function getAuthors(csl = {}) {
  return Array.isArray(csl.author) ? csl.author : []
}

function authorLastFirst(author = {}) {
  if (!author.family) return author.given || ''
  return author.given ? `${author.family}, ${author.given}` : author.family
}

function authorFirstLast(author = {}) {
  if (!author.family) return author.given || ''
  return author.given ? `${author.given} ${author.family}` : author.family
}

function authorLast(author = {}) {
  return author.family || author.given || ''
}

function initials(author = {}) {
  if (!author.given) return ''
  return author.given
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((segment) => `${segment[0]}.`)
    .join(' ')
}

function authorLastInitials(author = {}) {
  return `${author.family || ''}${author.given ? `, ${initials(author)}` : ''}`
}

function italicize(text = '') {
  return `*${text}*`
}

function apaAuthors(authors = []) {
  if (authors.length === 0) return ''
  if (authors.length === 1) return authorLastInitials(authors[0])
  if (authors.length === 2) return `${authorLastInitials(authors[0])} & ${authorLastInitials(authors[1])}`
  if (authors.length <= 20) {
    return `${authors.slice(0, -1).map(authorLastInitials).join(', ')}, & ${authorLastInitials(authors.at(-1))}`
  }
  return `${authors.slice(0, 19).map(authorLastInitials).join(', ')}, ... ${authorLastInitials(authors.at(-1))}`
}

function apaReference(csl = {}) {
  const parts = [apaAuthors(getAuthors(csl)), `(${getYear(csl)}).`, `${csl.title || ''}.`]
  if (csl['container-title']) {
    parts.push(`${italicize(csl['container-title'])},`)
    const volume = csl.volume ? italicize(csl.volume) : ''
    const issue = csl.issue ? `(${csl.issue})` : ''
    if (volume || issue) parts.push(`${volume}${issue}${csl.page ? `, ${csl.page}` : ''}.`)
    else if (csl.page) parts.push(`${csl.page}.`)
  } else if (csl.publisher) {
    parts.push(`${csl.publisher}.`)
  }
  if (csl.DOI) parts.push(`https://doi.org/${csl.DOI}`)
  return parts.filter(Boolean).join(' ')
}

function apaInline(csl = {}) {
  const authors = getAuthors(csl)
  const year = getYear(csl)
  if (authors.length === 0) return `(${year})`
  if (authors.length === 1) return `(${authorLast(authors[0])}, ${year})`
  if (authors.length === 2) return `(${authorLast(authors[0])} & ${authorLast(authors[1])}, ${year})`
  return `(${authorLast(authors[0])} et al., ${year})`
}

function chicagoAuthors(authors = []) {
  if (authors.length === 0) return ''
  if (authors.length === 1) return authorLastFirst(authors[0])
  if (authors.length === 2) {
    return `${authorLastFirst(authors[0])} and ${authorFirstLast(authors[1])}`
  }
  if (authors.length === 3) {
    return `${authorLastFirst(authors[0])}, ${authorFirstLast(authors[1])}, and ${authorFirstLast(authors[2])}`
  }
  return `${authorLastFirst(authors[0])} et al.`
}

function chicagoReference(csl = {}) {
  const parts = []
  parts.push(chicagoAuthors(getAuthors(csl)) + '.')
  parts.push(getYear(csl) + '.')
  parts.push(`"${csl.title || ''}."`)
  if (csl['container-title']) {
    parts.push(italicize(csl['container-title']))
    const extras = []
    if (csl.volume) extras.push(csl.volume)
    if (csl.issue) extras.push(`no. ${csl.issue}`)
    if (extras.length) parts.push(extras.join(', '))
    if (csl.page) parts.push(`: ${csl.page}.`)
    else parts.push('.')
  } else if (csl.publisher) {
    parts.push(csl.publisher + '.')
  }
  if (csl.DOI) parts.push(`https://doi.org/${csl.DOI}.`)
  return parts.filter(Boolean).join(' ')
}

function chicagoInline(csl = {}) {
  const authors = getAuthors(csl)
  const year = getYear(csl)
  if (authors.length === 0) return `(${year})`
  if (authors.length <= 3) {
    const names = authors.map(authorLast)
    if (names.length === 2) return `(${names[0]} and ${names[1]} ${year})`
    return `(${names.join(', ')} ${year})`
  }
  return `(${authorLast(authors[0])} et al. ${year})`
}

function ieeeReference(csl = {}, number) {
  const parts = []
  const prefix = number !== undefined ? `[${number}] ` : ''
  const authors = getAuthors(csl)

  if (authors.length > 0) {
    const names = authors.map((author) => `${initials(author)} ${author.family || ''}`.trim()).join(', ')
    parts.push(`${names},`)
  }

  parts.push(`"${csl.title || ''},"`)

  if (csl['container-title']) {
    parts.push(`${italicize(csl['container-title'])},`)
    if (csl.volume) parts.push(`vol. ${csl.volume},`)
    if (csl.issue) parts.push(`no. ${csl.issue},`)
    if (csl.page) parts.push(`pp. ${csl.page},`)
  } else if (csl.publisher) {
    parts.push(`${csl.publisher},`)
  }

  parts.push(`${getYear(csl)}.`)
  if (csl.DOI) parts.push(`doi: ${csl.DOI}.`)
  return `${prefix}${parts.filter(Boolean).join(' ')}`.trim()
}

function ieeeInline(_csl = {}, number) {
  return number !== undefined ? `[${number}]` : '[?]'
}

function harvardReference(csl = {}) {
  const parts = []
  const authors = getAuthors(csl)

  if (authors.length > 0) {
    if (authors.length <= 3) {
      parts.push(authors.map(authorLastFirst).join(', '))
    } else {
      parts.push(`${authorLastFirst(authors[0])} et al.`)
    }
  }

  parts.push(`(${getYear(csl)})`)
  parts.push(`'${csl.title || ''}',`)

  if (csl['container-title']) {
    parts.push(`${italicize(csl['container-title'])},`)
    if (csl.volume) parts.push(`${csl.volume}${csl.issue ? `(${csl.issue})` : ''},`)
    if (csl.page) parts.push(`pp. ${csl.page}.`)
  } else if (csl.publisher) {
    parts.push(`${csl.publisher}.`)
  }

  if (csl.DOI) parts.push(`doi: ${csl.DOI}.`)
  return parts.filter(Boolean).join(' ')
}

function harvardInline(csl = {}) {
  return apaInline(csl)
}

function vancouverReference(csl = {}, number) {
  const authors = getAuthors(csl)
  const prefix = number !== undefined ? `${number}. ` : ''
  const names = authors.slice(0, 6).map((author) => {
    const given = author.given
      ? author.given
          .split(/[\s-]+/)
          .filter(Boolean)
          .map((part) => part[0])
          .join('')
      : ''
    return `${author.family || ''} ${given}`.trim()
  })
  if (authors.length > 6) names.push('et al')

  const parts = [names.length > 0 ? `${names.join(', ')}.` : '', `${csl.title || ''}.`]
  if (csl['container-title']) parts.push(`${csl['container-title']}.`)
  parts.push(`${getYear(csl)}`)
  const extras = []
  if (csl.volume) extras.push(csl.volume)
  if (csl.issue) extras.push(`(${csl.issue})`)
  if (csl.page) extras.push(`:${csl.page}`)
  if (extras.length > 0) parts.push(`${extras.join('')}.`)
  if (csl.DOI) parts.push(`doi:${csl.DOI}.`)
  return `${prefix}${parts.filter(Boolean).join(' ')}`.trim()
}

function vancouverInline(_csl = {}, number) {
  return number !== undefined ? `(${number})` : '(?)'
}

const FAST_STYLES = {
  apa: { reference: apaReference, inline: apaInline, bibliography: apaReference },
  chicago: { reference: chicagoReference, inline: chicagoInline, bibliography: chicagoReference },
  ieee: { reference: ieeeReference, inline: ieeeInline, bibliography: ieeeReference },
  harvard: { reference: harvardReference, inline: harvardInline, bibliography: harvardReference },
  vancouver: { reference: vancouverReference, inline: vancouverInline, bibliography: vancouverReference },
}

function getFastFormatter(style = 'apa', mode = 'reference') {
  return FAST_STYLES[style]?.[mode] || FAST_STYLES.apa.reference
}

export function isFastCitationStyle(style = 'apa') {
  return Object.prototype.hasOwnProperty.call(FAST_STYLES, style)
}

export function formatReference(csl = {}, style = 'apa', number) {
  return getFastFormatter(style, 'reference')(csl, number)
}

export function formatInlineCitation(csl = {}, style = 'apa', number) {
  return getFastFormatter(style, 'inline')(csl, number)
}

export function formatCslBibliography(cslRecords = [], style = 'apa') {
  return cslRecords
    .map((csl, index) => getFastFormatter(style, 'bibliography')(csl, index + 1))
    .filter(Boolean)
    .join('\n\n')
}

export function formatCitation(style = 'apa', mode = 'reference', reference = {}, number) {
  return getFastFormatter(style, mode)(referenceRecordToCsl(reference), number)
}

export function formatBibliography(style = 'apa', references = []) {
  return formatCslBibliography(references.map((reference) => referenceRecordToCsl(reference)), style)
}

export async function formatCitationAsync(style = 'apa', mode = 'reference', reference = {}, number) {
  const { formatCitationWithStyle } = await import('./citationStyleRegistry.js')
  return formatCitationWithStyle(style, mode, reference, number)
}

export async function formatBibliographyAsync(style = 'apa', references = []) {
  const { formatBibliographyWithStyle } = await import('./citationStyleRegistry.js')
  return formatBibliographyWithStyle(style, references)
}

