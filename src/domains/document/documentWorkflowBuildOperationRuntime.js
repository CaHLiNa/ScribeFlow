import { createDocumentWorkflowBuildRuntime } from './documentWorkflowBuildRuntime.js'

export function createDocumentWorkflowBuildOperationRuntime({
  getBuildRuntime = () => createDocumentWorkflowBuildRuntime(),
} = {}) {
  async function runBuildForFile(filePath, options = {}) {
    if (!filePath) return null

    const buildRuntime = getBuildRuntime?.() || null
    if (!buildRuntime?.buildAdapterContext) {
      return null
    }

    const context = buildRuntime.buildAdapterContext(filePath, options)
    if (context?.adapter?.kind === 'latex' && context.editorStore?.isFileDirty?.(filePath)) {
      const persisted = await context.editorStore.persistPath(filePath, {
        suppressLatexAutoBuild: true,
      })
      if (!persisted) {
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
