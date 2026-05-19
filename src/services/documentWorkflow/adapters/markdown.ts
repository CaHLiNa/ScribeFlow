import { isMarkdown } from '../../../utils/fileTypes.ts'

function isMarkdownWorkflowSource(filePath = '') {
  return isMarkdown(filePath)
}

function resolveMarkdownDraftProblems(sourcePath, content = '', context = {}) {
  const request = {
    sourcePath,
    content,
  }
  const runtimeProblems = context.workflowStore?.ensureResolvedMarkdownDraftProblems?.(sourcePath, request)
  if (Array.isArray(runtimeProblems)) return runtimeProblems
  return []
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

export const markdownDocumentAdapter = {
  kind: 'markdown',

  matchesFile(filePath) {
    return isMarkdown(filePath)
  },

  supportsWorkflowSource(filePath) {
    return isMarkdownWorkflowSource(filePath)
  },

  preview: markdownPreviewAdapter,
  compile: null,

  getProblems(filePath, context = {}) {
    const draftProblems = resolveMarkdownDraftProblems(
      filePath,
      context.filesStore?.fileContents?.[filePath] || '',
      context,
    )
    return [
      ...draftProblems,
      ...buildMarkdownWorkflowProblems(filePath, context.workflowStore?.markdownPreviewState?.[filePath] || {}),
    ]
  },
}
