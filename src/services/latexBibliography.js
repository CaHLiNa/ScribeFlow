import { extractLatexCitationKeys } from './latexCitationParsing.js'
import { parseBibtex } from '../utils/bibtexParser.js'

export const ALTALS_MANAGED_BIB_BEGIN = '% >>> Altals managed references begin'
export const ALTALS_MANAGED_BIB_END = '% >>> Altals managed references end'

const LATEX_BIB_RE = /\\(?:bibliography|addbibresource)\{[^}]+\}|\\printbibliography\b/
const LATEX_BIBLATEX_PKG_RE = /\\usepackage(?:\[[^\]]*])?\{[^}]*biblatex[^}]*\}/
const LATEX_ADDBIBRESOURCE_RE = /\\addbibresource\{[^}]+\}/
const LATEX_PRINTBIB_RE = /\\printbibliography\b/
const LATEX_NOCITE_ALL_RE = /\\nocite\{\s*\*\s*\}/
const BEGIN_DOCUMENT_RE = /\\begin\{document\}/
const END_DOCUMENT_RE = /\\end\{document\}/

function normalizeNewlines(content = '') {
  return String(content || '').replace(/\r\n/g, '\n')
}

function ensureTrailingNewline(content = '') {
  const normalized = normalizeNewlines(content)
  if (!normalized) return ''
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`
}

function trimTrailingWhitespace(content = '') {
  return String(content || '').replace(/\s*$/, '')
}

function trimLeadingWhitespace(content = '') {
  return String(content || '').replace(/^\s*/, '')
}

function composeBibSections(before = '', managed = '', after = '') {
  const sections = []
  const beforePart = trimTrailingWhitespace(before)
  const afterPart = trimLeadingWhitespace(after)

  if (beforePart) sections.push(beforePart)
  if (managed) sections.push(managed)
  if (afterPart) sections.push(afterPart)

  return sections.length ? `${sections.join('\n\n')}\n` : ''
}

function splitManagedBibBlock(content = '') {
  const source = normalizeNewlines(content)
  const start = source.indexOf(ALTALS_MANAGED_BIB_BEGIN)
  if (start === -1) {
    return { before: source, after: '', hasManagedBlock: false }
  }

  const end = source.indexOf(ALTALS_MANAGED_BIB_END, start)
  if (end === -1) {
    return { before: source, after: '', hasManagedBlock: false }
  }

  return {
    before: source.slice(0, start),
    after: source.slice(end + ALTALS_MANAGED_BIB_END.length),
    hasManagedBlock: true,
  }
}

function buildManagedBibBlock(managedEntries = '', { createIfEmpty = false } = {}) {
  const body = trimTrailingWhitespace(managedEntries)
  if (!body && !createIfEmpty) return ''
  if (!body) return `${ALTALS_MANAGED_BIB_BEGIN}\n${ALTALS_MANAGED_BIB_END}`
  return `${ALTALS_MANAGED_BIB_BEGIN}\n${body}\n${ALTALS_MANAGED_BIB_END}`
}

function documentInsertionPoint(content = '', pattern) {
  const source = normalizeNewlines(content)
  const match = pattern.exec(source)
  return match ? match.index : source.length
}

export function bibliographyPathForSource(sourcePath = '') {
  const normalized = String(sourcePath || '')
  const slash = normalized.lastIndexOf('/')
  const dir = slash >= 0 ? normalized.slice(0, slash) : '.'
  return `${dir}/references.bib`
}

export function hasLatexBibliographyDirective(content = '') {
  return LATEX_BIB_RE.test(normalizeNewlines(content))
}

export function hasBiblatexUsage(content = '') {
  const source = normalizeNewlines(content)
  return LATEX_BIBLATEX_PKG_RE.test(source)
    || LATEX_ADDBIBRESOURCE_RE.test(source)
    || LATEX_PRINTBIB_RE.test(source)
}

export function hasLatexCitationUsage(content = '') {
  const source = normalizeNewlines(content)
  return extractLatexCitationKeys(source).length > 0 || LATEX_NOCITE_ALL_RE.test(source)
}

export function shouldSyncLatexBibliography({ content = '', hasExistingBib = false } = {}) {
  return Boolean(
    hasExistingBib
    || hasLatexCitationUsage(content)
    || hasLatexBibliographyDirective(content),
  )
}

export function buildLatexBibliographyInsertPlan(content = '') {
  const source = normalizeNewlines(content)
  if (hasLatexBibliographyDirective(source)) {
    return { mode: null, changes: [] }
  }

  const changes = []
  const beginDocument = documentInsertionPoint(source, BEGIN_DOCUMENT_RE)
  const endDocument = documentInsertionPoint(source, END_DOCUMENT_RE)

  if (hasBiblatexUsage(source)) {
    const preambleParts = []
    if (!LATEX_BIBLATEX_PKG_RE.test(source)) {
      preambleParts.push('\\usepackage[backend=biber]{biblatex}')
    }
    if (!LATEX_ADDBIBRESOURCE_RE.test(source)) {
      preambleParts.push('\\addbibresource{references.bib}')
    }
    if (preambleParts.length > 0) {
      changes.push({
        from: beginDocument,
        to: beginDocument,
        insert: `${preambleParts.join('\n')}\n`,
      })
    }
    if (!LATEX_PRINTBIB_RE.test(source)) {
      changes.push({
        from: endDocument,
        to: endDocument,
        insert: '\n\\printbibliography\n',
      })
    }
    return { mode: 'biblatex', changes }
  }

  changes.push({
    from: endDocument,
    to: endDocument,
    insert: '\n\\bibliographystyle{plain}\n\\bibliography{references}\n',
  })
  return { mode: 'bibtex', changes }
}

export function normalizeBibContent(content = '') {
  return normalizeNewlines(content).trim()
}

export function stripManagedBibBlock(content = '') {
  const { before, after } = splitManagedBibBlock(content)
  return composeBibSections(before, '', after)
}

export function extractBibKeys(content = '') {
  const keys = new Set()
  for (const entry of parseBibtex(normalizeNewlines(content))) {
    const key = entry?._key || entry?.id
    if (key) keys.add(key)
  }
  return keys
}

export function mergeManagedBibBlock(existingContent = '', managedEntries = '', options = {}) {
  const { before, after } = splitManagedBibBlock(existingContent)
  const managedBlock = buildManagedBibBlock(managedEntries, options)
  return composeBibSections(before, managedBlock, after)
}

export function planBibFileSync({
  sourcePath,
  sourceContent = '',
  existingBibContent = null,
  referencesStore,
  force = false,
} = {}) {
  const bibPath = bibliographyPathForSource(sourcePath)
  const existingContent = existingBibContent == null ? null : ensureTrailingNewline(existingBibContent)
  const hasExistingBib = existingContent != null
  const shouldSync = force || shouldSyncLatexBibliography({
    content: sourceContent,
    hasExistingBib,
  })

  if (!shouldSync) {
    return {
      bibPath,
      shouldSync: false,
      shouldWrite: false,
      nextContent: existingContent,
      managedKeys: [],
      externalKeys: new Set(),
    }
  }

  const externalContent = stripManagedBibBlock(existingContent || '')
  const externalKeys = extractBibKeys(externalContent)
  const allKeys = Array.from(referencesStore?.allKeys || [])
  const managedKeys = allKeys.filter((key) => !externalKeys.has(key))
  const managedEntries = trimTrailingWhitespace(
    referencesStore?.exportBibTeX ? referencesStore.exportBibTeX(managedKeys) : '',
  )
  const nextContent = mergeManagedBibBlock(existingContent || '', managedEntries, {
    createIfEmpty: force || !hasExistingBib,
  })

  return {
    bibPath,
    shouldSync: true,
    shouldWrite: normalizeBibContent(nextContent) !== normalizeBibContent(existingContent || ''),
    nextContent,
    managedKeys,
    externalKeys,
  }
}
