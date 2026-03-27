import { isMarkdown } from '../../../utils/fileTypes.js'
import { buildMarkdownDraftProblems } from '../../markdown/diagnostics.js'

function isMarkdownWorkflowSource(filePath = '') {
  return isMarkdown(filePath)
}

function defaultCitationText(keys) {
  const joined = keys.map(key => `@${key}`).join('; ')
  return `[${joined}]`
}

function summarizeProblems(problems = []) {
  const errorCount = problems.filter(problem => problem.severity === 'error').length
  const warningCount = problems.filter(problem => problem.severity === 'warning').length
  return { errorCount, warningCount }
}

export function buildMarkdownWorkflowProblems(sourcePath, state = {}) {
  return Array.isArray(state?.problems)
    ? state.problems.map((problem, index) => ({
      id: problem.id || `markdown:${sourcePath}:${index}`,
      sourcePath,
      line: problem.line ?? null,
      column: problem.column ?? null,
      severity: problem.severity || 'error',
      message: problem.message || '',
      origin: problem.origin || 'preview',
      actionable: problem.actionable !== false,
      raw: problem.raw,
    }))
    : []
}

export function buildMarkdownWorkflowUiState({
  previewAvailable = false,
  draftProblems = [],
  htmlState = {},
}) {
  const problems = [
    ...draftProblems,
    ...buildMarkdownWorkflowProblems('', htmlState),
  ]
  const { errorCount, warningCount } = summarizeProblems(problems)

  let phase = 'idle'
  if (htmlState?.status === 'rendering') phase = 'rendering'
  else if (htmlState?.status === 'error') phase = 'error'
  else if (previewAvailable || htmlState?.status === 'ready') phase = 'ready'

  return {
    kind: 'markdown',
    previewKind: 'html',
    phase,
    errorCount,
    warningCount,
    canShowProblems: errorCount > 0 || warningCount > 0,
    canRevealPreview: true,
    forwardSync: 'precise',
    backwardSync: true,
    primaryAction: 'refresh',
  }
}

export function buildMarkdownWorkflowStatusText({
  htmlState = {},
}, t = (value) => value) {
  if (htmlState?.status === 'rendering') return t('Rendering...')
  if (htmlState?.status === 'error') return t('Preview failed')
  return ''
}

const markdownPreviewAdapter = {
  defaultKind: 'html',
  supportedKinds: ['html'],

  createPath(sourcePath, previewKind) {
    if (!sourcePath || !previewKind) return null
    if (previewKind === 'html') return `preview:${sourcePath}`
    return null
  },

  inferKind(sourcePath, previewPath) {
    if (!sourcePath || !previewPath) return null
    if (previewPath === this.createPath(sourcePath, 'html')) return 'html'
    return null
  },

  ensure(sourcePath, context, options = {}) {
    return context.workflowStore?.ensurePreviewForSource(sourcePath, {
      ...options,
      previewKind: options.previewKind || 'html',
    }) || null
  },

  async reveal(sourcePath, context, options = {}) {
    return context.workflowStore?.revealPreview(sourcePath, {
      ...options,
      activatePreview: options.activatePreview !== false,
      previewKind: 'html',
    }) || null
  },
}

const markdownCitationSyntax = {
  supportsInsertion(filePath) {
    return isMarkdown(filePath)
  },

  buildText(_filePath, keys) {
    const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean)
    return list.length > 0 ? defaultCitationText(list) : ''
  },
}

export const markdownDocumentAdapter = {
  kind: 'markdown',

  matchesFile(filePath) {
    return isMarkdown(filePath)
  },

  supportsWorkflowSource(filePath) {
    return isMarkdownWorkflowSource(filePath)
  },

  preview: markdownPreviewAdapter,
  citationSyntax: markdownCitationSyntax,
  compile: null,

  getProblems(filePath, context = {}) {
    const draftProblems = buildMarkdownDraftProblems(
      filePath,
      context.filesStore?.fileContents?.[filePath] || '',
      { referenceKeys: context.referencesStore?.allKeys || [] },
    )
    return [
      ...draftProblems,
      ...buildMarkdownWorkflowProblems(filePath, context.workflowStore?.markdownPreviewState?.[filePath] || {}),
    ]
  },

  getUiState(filePath, context = {}) {
    const draftProblems = buildMarkdownDraftProblems(
      filePath,
      context.filesStore?.fileContents?.[filePath] || '',
      { referenceKeys: context.referencesStore?.allKeys || [] },
    )
    return buildMarkdownWorkflowUiState({
      previewAvailable: !!context.previewAvailable,
      draftProblems,
      htmlState: context.workflowStore?.markdownPreviewState?.[filePath] || {},
    })
  },
}
