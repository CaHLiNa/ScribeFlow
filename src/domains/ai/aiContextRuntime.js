import {
  basenamePath,
  extnamePath,
  normalizeFsPath,
} from '../../services/documentIntelligence/workspaceGraph.js'

const EMPTY_SELECTION = Object.freeze({
  filePath: '',
  from: null,
  to: null,
  text: '',
  preview: '',
  hasSelection: false,
})

const MAX_SELECTION_TEXT_CHARS = 2400
const MAX_SELECTION_PREVIEW_CHARS = 280

function trimText(value = '', maxChars = MAX_SELECTION_TEXT_CHARS) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars).trimEnd()}…`
}

function buildPreviewText(value = '', maxChars = MAX_SELECTION_PREVIEW_CHARS) {
  const compact = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!compact) return ''
  if (compact.length <= maxChars) return compact
  return `${compact.slice(0, maxChars).trimEnd()}…`
}

function normalizeReference(reference = null) {
  if (!reference || typeof reference !== 'object') {
    return {
      id: '',
      title: '',
      citationKey: '',
      year: '',
      authorLine: '',
      available: false,
    }
  }

  const authors = Array.isArray(reference.authors) ? reference.authors.filter(Boolean) : []
  const authorLine =
    authors.length > 0
      ? authors.length === 1
        ? authors[0]
        : `${authors[0]} et al.`
      : String(reference.authorLine || '').trim()

  return {
    id: String(reference.id || '').trim(),
    title: String(reference.title || '').trim(),
    citationKey: String(reference.citationKey || '').trim(),
    year: String(reference.year || '').trim(),
    authorLine,
    available: String(reference.id || '').trim().length > 0,
  }
}

export function normalizeAiSelection(selection = null) {
  if (!selection || typeof selection !== 'object') {
    return { ...EMPTY_SELECTION }
  }

  const text = trimText(selection.text || '')
  const from = Number.isInteger(selection.from) ? selection.from : null
  const to = Number.isInteger(selection.to) ? selection.to : null

  return {
    filePath: normalizeFsPath(selection.filePath || ''),
    from,
    to,
    text,
    preview: buildPreviewText(text),
    hasSelection: text.length > 0 && from !== null && to !== null && to > from,
  }
}

export function isAiContextAvailable(kind = '', contextBundle = {}) {
  if (kind === 'workspace') return contextBundle.workspace?.available === true
  if (kind === 'document') return contextBundle.document?.available === true
  if (kind === 'selection') return contextBundle.selection?.available === true
  if (kind === 'reference') return contextBundle.reference?.available === true
  return false
}

export function buildAiContextBundle({
  workspacePath = '',
  activeFile = '',
  selection = null,
  selectedReference = null,
  referenceActive = true,
} = {}) {
  const normalizedWorkspacePath = normalizeFsPath(workspacePath || '')
  const filePath = normalizeFsPath(activeFile || '')
  const extension = extnamePath(filePath)
  const normalizedSelection = normalizeAiSelection(selection)
  const selectionMatchesDocument = filePath && normalizedSelection.filePath === filePath
  const activeSelection = selectionMatchesDocument ? normalizedSelection : { ...EMPTY_SELECTION }
  const reference = referenceActive ? normalizeReference(selectedReference) : normalizeReference(null)

  return {
    workspace: {
      path: normalizedWorkspacePath,
      label: basenamePath(normalizedWorkspacePath),
      available: normalizedWorkspacePath.length > 0,
    },
    document: {
      filePath,
      label: basenamePath(filePath),
      extension,
      isMarkdown: extension === '.md',
      isLatex: extension === '.tex' || extension === '.latex',
      available: filePath.length > 0,
    },
    selection: {
      ...activeSelection,
      available: activeSelection.hasSelection,
    },
    reference,
    availableContexts: ['workspace', 'document', 'selection', 'reference'].filter((kind) =>
      isAiContextAvailable(kind, {
        workspace: { available: normalizedWorkspacePath.length > 0 },
        document: { available: filePath.length > 0 },
        selection: { available: activeSelection.hasSelection },
        reference,
      })
    ),
  }
}

export function skillHasRequiredContext(skill = {}, contextBundle = {}) {
  const requiredContext = Array.isArray(skill.requiredContext) ? skill.requiredContext : []
  return requiredContext.every((kind) => isAiContextAvailable(kind, contextBundle))
}
