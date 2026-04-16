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
  const compact = String(value || '').replace(/\s+/g, ' ').trim()
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
  const authorLine = authors.length > 0
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
} = {}) {
  const normalizedWorkspacePath = normalizeFsPath(workspacePath || '')
  const filePath = normalizeFsPath(activeFile || '')
  const extension = extnamePath(filePath)
  const normalizedSelection = normalizeAiSelection(selection)
  const selectionMatchesDocument = filePath && normalizedSelection.filePath === filePath
  const activeSelection = selectionMatchesDocument ? normalizedSelection : { ...EMPTY_SELECTION }
  const reference = normalizeReference(selectedReference)

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

function buildRecommendationReason(skillId = '', contextBundle = {}) {
  if (skillId === 'grounded-chat') {
    return contextBundle.workspace.available
      ? 'The current folder is available, so the AI can answer in project context.'
      : 'Open a project folder to start a grounded AI chat.'
  }
  if (skillId === 'revise-with-citations') {
    return contextBundle.selection.available && contextBundle.reference.available
      ? 'The active selection and selected reference can be revised together.'
      : 'This skill needs both a selection and a selected reference.'
  }
  if (skillId === 'summarize-selection') {
    return contextBundle.selection.available
      ? 'The current selection is ready to be summarized into a research note.'
      : 'Select text in the active draft to use this skill.'
  }
  if (skillId === 'draft-related-work') {
    return contextBundle.document.available && contextBundle.reference.available
      ? 'The active draft and selected reference can anchor a related-work pass.'
      : 'Open a draft and choose a reference to ground this skill.'
  }
  if (skillId === 'find-supporting-references') {
    return contextBundle.selection.available
      ? 'The active passage can be used to look for missing support.'
      : 'This skill works best when a passage in the draft is selected.'
  }
  return 'Ground the skill in the current project context before running it.'
}

function computeRecommendationScore(skill = {}, contextBundle = {}) {
  const available = skillHasRequiredContext(skill, contextBundle)

  if (skill.id === 'grounded-chat') {
    if (available && contextBundle.selection.available && contextBundle.reference.available) return 90
    if (available && contextBundle.document.available && contextBundle.selection.available) return 80
    if (available && contextBundle.document.available) return 70
    if (available) return 55
    return 10
  }
  if (skill.id === 'revise-with-citations') {
    if (available) return 120
    if (contextBundle.document.available && contextBundle.selection.available) return 70
    return 10
  }
  if (skill.id === 'draft-related-work') {
    if (available) return 110
    if (contextBundle.document.available) return 60
    return 10
  }
  if (skill.id === 'summarize-selection') {
    if (available) return 100
    return 20
  }
  if (skill.id === 'find-supporting-references') {
    if (available) return 90
    if (contextBundle.document.available) return 40
    return 10
  }

  return available ? 50 : 0
}

export function recommendAiSkills(contextBundle = {}, skills = []) {
  return [...skills]
    .map((skill) => ({
      ...skill,
      available: skillHasRequiredContext(skill, contextBundle),
      score: computeRecommendationScore(skill, contextBundle),
      reason: buildRecommendationReason(skill.id, contextBundle),
    }))
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score
      return String(left.id || '').localeCompare(String(right.id || ''))
    })
}
