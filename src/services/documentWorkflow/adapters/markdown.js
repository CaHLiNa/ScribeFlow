import { isMarkdown } from '../../../utils/fileTypes.js'

function isMarkdownWorkflowSource(filePath = '') {
  return isMarkdown(filePath)
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
}
