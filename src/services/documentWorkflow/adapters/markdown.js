import { isMarkdown, isRmdOrQmd } from '../../../utils/fileTypes.js'
import { ensureMarkdownPdfExportReady } from '../../environmentPreflight.js'
import { ensureBibFile } from '../../latexBib.js'
import {
  cleanupMarkdownExportArtifacts,
  cleanupMarkdownExportArtifactsInDir,
  markdownPdfPathExists,
  materializeCustomCslStyle,
  writeMarkdownExportFile,
} from '../../markdownPdfExport.js'
import { buildMarkdownDraftProblems } from '../../markdown/diagnostics.js'
import { normalizeMarkdownDraftForExport } from '../../markdown/normalize.js'

const BUILTIN_TYPST_STYLES = ['apa', 'chicago', 'ieee', 'harvard', 'vancouver']

function isMarkdownWorkflowSource(filePath = '') {
  return isMarkdown(filePath)
}

function defaultCitationText(keys) {
  const joined = keys.map(key => `@${key}`).join('; ')
  return `[${joined}]`
}

function buildMarkdownPdfProblems(sourcePath, errors = []) {
  return errors.map((error, index) => ({
    id: `markdown-pdf:${sourcePath}:${index}`,
    sourcePath,
    line: error?.line || null,
    column: error?.column || null,
    severity: error?.severity || 'error',
    message: error?.message || String(error),
    origin: 'export',
    actionable: true,
    raw: error?.raw || error?.message || String(error),
  }))
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
  exportAvailable = false,
  draftProblems = [],
  htmlState = {},
  pdfState = {},
}) {
  const problems = [
    ...draftProblems,
    ...buildMarkdownWorkflowProblems('', htmlState),
    ...buildMarkdownWorkflowProblems('', pdfState),
  ]
  const { errorCount, warningCount } = summarizeProblems(problems)

  let phase = 'idle'
  if (htmlState?.status === 'rendering') phase = 'rendering'
  else if (htmlState?.status === 'error') phase = 'error'
  else if (previewAvailable || htmlState?.status === 'ready') phase = 'ready'

  let exportPhase = 'idle'
  if (pdfState?.status === 'rendering') exportPhase = 'exporting'
  else if (pdfState?.status === 'error') exportPhase = 'error'
  else if (exportAvailable || pdfState?.status === 'ready') exportPhase = 'ready'

  return {
    kind: 'markdown',
    previewKind: 'html',
    phase,
    exportPhase,
    errorCount,
    warningCount,
    canShowProblems: errorCount > 0 || warningCount > 0,
    canRevealPreview: true,
    exportAvailable,
    forwardSync: 'precise',
    backwardSync: true,
    primaryAction: 'refresh',
  }
}

export function buildMarkdownWorkflowStatusText({
  htmlState = {},
  pdfState = {},
}, t = (value) => value) {
  if (pdfState?.status === 'rendering') return t('Exporting PDF...')
  if (pdfState?.status === 'error') return t('PDF export failed')
  if (htmlState?.status === 'rendering') return t('Rendering...')
  if (htmlState?.status === 'error') return t('Preview failed')
  return ''
}

const markdownPreviewAdapter = {
  defaultKind: 'html',
  supportedKinds: ['html', 'pdf'],

  createPath(sourcePath, previewKind) {
    if (!sourcePath || !previewKind) return null
    if (previewKind === 'html') return `preview:${sourcePath}`
    if (previewKind === 'pdf') return sourcePath.replace(/\.(md|rmd|qmd)$/i, '.pdf')
    return null
  },

  inferKind(sourcePath, previewPath) {
    if (!sourcePath || !previewPath) return null
    if (previewPath === this.createPath(sourcePath, 'html')) return 'html'
    if (previewPath === this.createPath(sourcePath, 'pdf')) return 'pdf'
    return null
  },

  ensure(sourcePath, context, options = {}) {
    return context.workflowStore?.ensurePreviewForSource(sourcePath, {
      ...options,
      previewKind: options.previewKind || 'html',
    }) || null
  },

  async reveal(sourcePath, context, options = {}) {
    const previewKind = options.previewKind || 'html'
    if (previewKind === 'pdf') {
      try {
        const hasPdf = await markdownPdfPathExists(this.createPath(sourcePath, 'pdf'))
        if (hasPdf) {
          return context.workflowStore?.revealPreview(sourcePath, {
            ...options,
            previewKind: 'pdf',
          }) || null
        }
      } catch {
        // Fall through to HTML preview.
      }
      return this.ensure(sourcePath, context, {
        ...options,
        activatePreview: true,
        previewKind: 'html',
      })
    }

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

const markdownCompileAdapter = {
  id: 'markdown-pdf',

  stateForFile(filePath, context) {
    return context.workflowStore?.markdownPdfState?.[filePath] || null
  },

  async ensureReady(_filePath) {
    return ensureMarkdownPdfExportReady()
  },

  getDiagnostics(filePath, context) {
    return buildMarkdownWorkflowProblems(filePath, this.stateForFile(filePath, context) || {})
  },

  getStatusText(filePath, context) {
    return buildMarkdownWorkflowStatusText({
      htmlState: context.workflowStore?.markdownPreviewState?.[filePath] || {},
      pdfState: this.stateForFile(filePath, context) || {},
    }, context.t)
  },

  getArtifactPath(filePath, context) {
    return this.stateForFile(filePath, context)?.pdfPath || filePath.replace(/\.(md|rmd|qmd)$/i, '.pdf')
  },

  async compile(filePath, context, options = {}) {
    const {
      workflowStore,
      typstStore,
      referencesStore,
      toastStore,
      editorStore,
      workspace,
    } = context

    if (!workflowStore || !typstStore || !referencesStore || !toastStore || !editorStore || !workspace) {
      return null
    }
    if (!(await this.ensureReady(filePath, context, options))) return null

    workflowStore.setMarkdownPdfState(filePath, {
      status: 'rendering',
      problems: [],
      durationMs: null,
    })

    let mdPathForExport = filePath
    let tempMdPath = null
    const exportDir = filePath.substring(0, filePath.lastIndexOf('/'))
    let markdownContentOverride = context.filesStore?.fileContents?.[filePath] || null

    try {
      if (isRmdOrQmd(filePath)) {
        const content = context.filesStore?.fileContents?.[filePath]
        if (content) {
          const { knitRmd } = await import('../../rmdKnit.js')
          markdownContentOverride = await knitRmd(content, workspace.path, { imageDir: exportDir })
        }
      }

      if (typeof markdownContentOverride === 'string') {
        markdownContentOverride = normalizeMarkdownDraftForExport(markdownContentOverride)
      }

      const settings = {
        ...((options.settingsOverride || typstStore.getSettings(filePath)) || {}),
      }
      if (!settings.bib_style) {
        settings.bib_style = referencesStore.citationStyle
      }

      if (settings.bib_style && !BUILTIN_TYPST_STYLES.includes(settings.bib_style)) {
        try {
          settings.bib_style = await materializeCustomCslStyle(filePath, settings.bib_style)
        } catch {
          settings.bib_style = 'apa'
        }
      }

      const expectedPdfPath = filePath.replace(/\.(md|rmd|qmd)$/i, '.pdf')
      const pdfExisted = await markdownPdfPathExists(expectedPdfPath)

      let bibPath = null
      try {
        bibPath = await ensureBibFile(filePath, {
          sourceContent: context.filesStore?.fileContents?.[filePath],
          force: true,
        })
      } catch {
        // Continue without bibliography.
      }

      const result = await typstStore.exportToPdf(mdPathForExport, bibPath, settings, {
        markdownContentOverride,
      })

      if (result?.success && result.pdf_path) {
        workflowStore.setMarkdownPdfState(filePath, {
          status: 'ready',
          problems: [],
          pdfPath: result.pdf_path,
          durationMs: result.duration_ms || null,
          lastCompiled: Date.now(),
        })
        workflowStore.bindPreview({
          previewPath: result.pdf_path,
          sourcePath: filePath,
          previewKind: 'pdf',
          kind: 'markdown',
        })
        if (!pdfExisted) {
          const pdfName = result.pdf_path.split('/').pop()
          const duration = result.duration_ms ? ` in ${result.duration_ms}ms` : ''
          toastStore.show(`Created ${pdfName}${duration}`)
        }
        workflowStore.revealPreview(filePath, {
          previewKind: 'pdf',
          sourcePaneId: options.sourcePaneId || null,
          trigger: options.trigger || 'markdown-export-pdf',
        })
        window.dispatchEvent(new CustomEvent('pdf-updated', {
          detail: { path: result.pdf_path },
        }))
        return result
      }

      const problems = buildMarkdownPdfProblems(filePath, result?.errors || [])
      workflowStore.setMarkdownPdfState(filePath, {
        status: 'error',
        problems,
        durationMs: result?.duration_ms || null,
      })

      if (result?.errors?.length) {
        const errorMessage = result.errors.map((error) => error.message).join('\n')
        editorStore.openChatBeside({
          prefill: `Typst export error:\n\`\`\`\n${errorMessage}\n\`\`\`\nBriefly explain and fix.`,
        })
      }

      return result
    } catch (error) {
      workflowStore.setMarkdownPdfState(filePath, {
        status: 'error',
        problems: [{
          id: `markdown-pdf:${filePath}:catch`,
          sourcePath: filePath,
          line: null,
          column: null,
          severity: 'error',
          message: error?.message || String(error),
          origin: 'export',
          actionable: true,
          raw: error?.stack || String(error),
        }],
      })
      return {
        success: false,
        pdf_path: null,
        errors: [{ line: null, message: error?.message || String(error), severity: 'error' }],
        warnings: [],
        duration_ms: 0,
      }
    } finally {
      if (tempMdPath) {
        try {
          await cleanupMarkdownExportArtifacts(tempMdPath)
        } catch {}
      } else if (isRmdOrQmd(filePath)) {
        try {
          await cleanupMarkdownExportArtifactsInDir(exportDir)
        } catch {}
      }
    }
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
  compile: markdownCompileAdapter,

  getProblems(filePath, context = {}) {
    const draftProblems = buildMarkdownDraftProblems(
      filePath,
      context.filesStore?.fileContents?.[filePath] || '',
      { referenceKeys: context.referencesStore?.allKeys || [] },
    )
    return [
      ...draftProblems,
      ...buildMarkdownWorkflowProblems(filePath, context.workflowStore?.markdownPreviewState?.[filePath] || {}),
      ...markdownCompileAdapter.getDiagnostics(filePath, context),
    ]
  },

  getUiState(filePath, context = {}) {
    const draftProblems = buildMarkdownDraftProblems(
      filePath,
      context.filesStore?.fileContents?.[filePath] || '',
      { referenceKeys: context.referencesStore?.allKeys || [] },
    )
    return buildMarkdownWorkflowUiState({
      previewAvailable: !!context.workflowStore?.hasPreviewForSource(filePath, 'html'),
      exportAvailable: !!(
        context.workflowStore?.hasPreviewForSource(filePath, 'pdf')
        || context.workflowStore?.markdownPdfState?.[filePath]?.pdfPath
        || context.workflowStore?.markdownPdfState?.[filePath]?.status === 'ready'
      ),
      draftProblems,
      htmlState: context.workflowStore?.markdownPreviewState?.[filePath] || {},
      pdfState: context.workflowStore?.markdownPdfState?.[filePath] || {},
    })
  },
}
