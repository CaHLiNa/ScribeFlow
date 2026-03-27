import { isTypst } from '../../../utils/fileTypes.js'
import {
  buildTypstCompileProblems,
  buildTypstWorkflowStatusText,
  buildTypstWorkflowProblems,
  buildTypstWorkflowUiState,
} from '../../typst/diagnostics.js'

const typstPreviewAdapter = {
  defaultKind: 'native',
  supportedKinds: ['native'],

  createPath(sourcePath, previewKind) {
    if (!sourcePath || previewKind !== 'native') return null
    return `typst-preview:${sourcePath}`
  },

  inferKind(sourcePath, previewPath) {
    return previewPath === this.createPath(sourcePath, 'native') ? 'native' : null
  },

  getTargetPath(sourcePath, context) {
    const state = typstCompileAdapter.stateForFile(sourcePath, context) || null
    return state?.previewPath || state?.pdfPath || ''
  },

  isNativeSupported(sourcePath, context, options = {}) {
    if (typeof options.nativePreviewSupported === 'boolean') {
      return options.nativePreviewSupported
    }
    const liveState = context.typstStore?.liveStateForFile?.(sourcePath) || null
    if (typeof liveState?.tinymistBacked === 'boolean') {
      return liveState.tinymistBacked
    }
    return true
  },

  ensure(sourcePath, context, options = {}) {
    return context.workflowStore?.ensurePreviewForSource(sourcePath, {
      ...options,
      previewKind: 'native',
    }) || null
  },

  reveal(sourcePath, context, options = {}) {
    return context.workflowStore?.revealPreview(sourcePath, {
      ...options,
      previewKind: 'native',
    }) || null
  },
}

const typstCitationSyntax = {
  supportsInsertion(filePath) {
    return isTypst(filePath)
  },

  buildText(_filePath, keys) {
    const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean)
    return list.map(key => `@${key}`).join(' ')
  },
}

const typstCompileAdapter = {
  id: 'typst',

  stateForFile(filePath, context) {
    return context.typstStore?.stateForFile(filePath) || null
  },

  async ensureReady(_filePath) {
    const { ensureTypstCompileReady } = await import('../../environmentPreflight.js')
    return ensureTypstCompileReady()
  },

  async compile(filePath, context, options = {}) {
    if (!context.typstStore) return null
    if (!(await this.ensureReady(filePath, context, options))) return null
    await context.typstStore.compile(filePath, options)
    return this.stateForFile(filePath, context)
  },

  getDiagnostics(filePath, context) {
    return buildTypstWorkflowProblems(filePath, {
      compileState: this.stateForFile(filePath, context) || {},
      queueState: context.typstStore?.queueStateForFile(filePath) || null,
      liveState: context.typstStore?.liveStateForFile(filePath) || null,
      referencesStore: context.referencesStore || null,
    })
  },

  getArtifactPath(filePath, context) {
    return this.stateForFile(filePath, context)?.pdfPath || filePath.replace(/\.typ$/i, '.pdf')
  },

  getStatusText(filePath, context) {
    return buildTypstWorkflowStatusText({
      compileState: this.stateForFile(filePath, context) || {},
      queueState: context.typstStore?.queueStateForFile(filePath) || null,
      liveState: context.typstStore?.liveStateForFile(filePath) || null,
    }, context.t)
  },

  openLog(filePath, context) {
    context.typstStore?.openCompileLog(filePath)
  },
}

export const typstDocumentAdapter = {
  kind: 'typst',

  matchesFile(filePath) {
    return isTypst(filePath)
  },

  supportsWorkflowSource(filePath) {
    return isTypst(filePath)
  },

  preview: typstPreviewAdapter,
  citationSyntax: typstCitationSyntax,
  compile: typstCompileAdapter,

  getProblems(filePath, context = {}) {
    return typstCompileAdapter.getDiagnostics(filePath, context)
  },

  getUiState(filePath, context = {}) {
    return buildTypstWorkflowUiState({
      sourcePath: filePath,
      compileState: typstCompileAdapter.stateForFile(filePath, context) || {},
      queueState: context.typstStore?.queueStateForFile(filePath) || null,
      liveState: context.typstStore?.liveStateForFile(filePath) || null,
      referencesStore: context.referencesStore || null,
      previewAvailable: !!context.previewAvailable,
      previewKind: context.previewKind || typstPreviewAdapter.defaultKind,
    })
  },
}

export { buildTypstCompileProblems }
