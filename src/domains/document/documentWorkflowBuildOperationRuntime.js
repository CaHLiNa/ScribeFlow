import { createDocumentWorkflowBuildRuntime } from './documentWorkflowBuildRuntime.js'

export function createDocumentWorkflowBuildOperationRuntime({
  getBuildRuntime = () => createDocumentWorkflowBuildRuntime(),
} = {}) {
  function markLatexBuildPending(context = null, filePath = '', options = {}) {
    if (context?.adapter?.kind !== 'latex') return
    context.latexStore?.markCompilePending?.(filePath, {
      ...options,
      reason: options.trigger || options.reason || 'manual',
    })
  }

  function markLatexBuildBlocked(context = null, filePath = '', message = '') {
    if (context?.adapter?.kind !== 'latex') return
    context.latexStore?.applyCompileStatePatch?.(filePath, {
      status: 'error',
      errors: [
        {
          line: null,
          message: message || 'Save failed before LaTeX compile.',
          severity: 'error',
        },
      ],
      warnings: [],
      updatedAt: Date.now(),
    })
  }

  async function runBuildForFile(filePath, options = {}) {
    if (!filePath) return null

    const buildRuntime = getBuildRuntime?.() || null
    if (!buildRuntime?.buildAdapterContext) {
      return null
    }

    const context = buildRuntime.buildAdapterContext(filePath, options)
    markLatexBuildPending(context, filePath, options)
    if (context?.adapter?.kind === 'latex' && context.editorStore?.isFileDirty?.(filePath)) {
      const persisted = await context.editorStore.persistPath(filePath, {
        suppressLatexAutoBuild: true,
      })
      if (!persisted) {
        markLatexBuildBlocked(context, filePath)
        return null
      }
    }
    const compileAdapter = context?.adapter?.compile || null
    if (!compileAdapter?.compile) {
      return null
    }

    return compileAdapter.compile(filePath, context, options)
  }

  return {
    runBuildForFile,
  }
}
