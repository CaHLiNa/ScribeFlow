import { isLatex } from '../../../utils/fileTypes.js'
import {
  buildLatexDocumentReferenceProblemsSync,
  buildLatexLintProblems,
  buildLatexProjectProblemsSync,
} from '../../latex/diagnostics.js'
import { resolveCachedLatexPreviewPath } from '../../latex/root.js'
import {
  buildLatexWorkflowUiState,
  formatLatexCompileDuration,
} from '../../../domains/document/latexWorkflowPresentation.js'

function resolveKnownLatexArtifactPath(sourcePath, context = {}) {
  const state = latexCompileAdapter.stateForFile(sourcePath, context) || null
  return state?.previewPath ||
    state?.pdfPath ||
    context.workflowStore?.getLatexArtifactPathForFile?.(sourcePath) ||
    ''
}

function resolveLatexArtifactPath(sourcePath, context = {}) {
  return resolveKnownLatexArtifactPath(sourcePath, context) ||
    resolveCachedLatexPreviewPath(sourcePath) ||
    ''
}

const latexPreviewAdapter = {
  defaultKind: null,
  supportedKinds: ['pdf'],

  createPath() {
    return null
  },

  inferKind() {
    return null
  },

  getTargetPath(sourcePath, context) {
    return resolveLatexArtifactPath(sourcePath, context)
  },

  ensure() {
    return null
  },

  reveal() {
    return null
  },
}

const latexCompileAdapter = {
  id: 'latex',

  stateForFile(filePath, context) {
    return context.latexStore?.stateForFile(filePath) || null
  },

  async ensureReady(_filePath) {
    const { ensureLatexCompileReady } =
      await import('../../environmentPreflight.js')
    return ensureLatexCompileReady()
  },

  async compile(filePath, context, options = {}) {
    if (!context.latexStore) return null
    context.latexStore.markCompilePending?.(filePath, options)
    if (!(await this.ensureReady(filePath, context, options))) {
      context.latexStore.applyCompileStatePatch?.(filePath, {
        status: 'error',
        errors: [
          {
            line: null,
            message: context.t?.('No LaTeX compiler found.') || 'No LaTeX compiler found.',
            severity: 'error',
          },
        ],
        warnings: [],
        updatedAt: Date.now(),
      })
      return null
    }

    await context.latexStore.compile(filePath, options)
    return this.stateForFile(filePath, context)
  },

  getDiagnostics(filePath, context) {
    const request = {
      sourcePath: filePath,
      state: this.stateForFile(filePath, context) || {},
    }
    const problems = context.workflowStore?.ensureResolvedLatexProblems?.(filePath, request)
    return Array.isArray(problems) ? problems : []
  },

  getArtifactPath(filePath, context) {
    return resolveLatexArtifactPath(filePath, context)
  },

  getStatusText(filePath, context) {
    const state = this.stateForFile(filePath, context) || {}
    const queueState = context.latexStore?.queueStateForFile?.(filePath) || null
    return formatLatexCompileDuration(state, context, queueState)
  },

  openLog(filePath, context) {
    context.latexStore?.openCompileLog(filePath)
  },
}

export const latexDocumentAdapter = {
  kind: 'latex',

  matchesFile(filePath) {
    return isLatex(filePath)
  },

  supportsWorkflowSource(filePath) {
    return isLatex(filePath)
  },

  preview: latexPreviewAdapter,
  compile: latexCompileAdapter,

  getProblems(filePath, context = {}) {
    const lintDiagnostics =
      context.latexStore?.lintDiagnosticsForFile(filePath) || []
    return [
      ...latexCompileAdapter.getDiagnostics(filePath, context),
      ...buildLatexProjectProblemsSync(filePath),
      ...buildLatexDocumentReferenceProblemsSync(filePath, context.referencesStore),
      ...buildLatexLintProblems(filePath, lintDiagnostics),
    ]
  },

  getUiState(filePath, context = {}) {
    const problems = this.getProblems(filePath, context)
    const queueState = context.latexStore?.queueStateForFile?.(filePath) || null
    return buildLatexWorkflowUiState(
      latexCompileAdapter.stateForFile(filePath, context) || {},
      {
        artifactReady: context.artifactReady === true,
        previewKind: context.previewKind || null,
        problems,
        queuePhase: queueState?.phase || null,
      },
    )
  },
}
