import {
  getDocumentAdapterByKind,
  getDocumentAdapterForFile,
  getDocumentAdapterForWorkflow,
  listDocumentAdapters,
  listWorkflowDocumentAdapters,
} from '../../services/documentWorkflow/adapters/index.js'

export function createDocumentWorkflowAdaptersRuntime() {
  function listAll() {
    return listDocumentAdapters()
  }

  function listWorkflowSources() {
    return listWorkflowDocumentAdapters()
  }

  function resolveByKind(kind) {
    return getDocumentAdapterByKind(kind)
  }

  function resolveForFile(filePath, options = {}) {
    if (options.workflowOnly === false) {
      return getDocumentAdapterForFile(filePath)
    }
    return getDocumentAdapterForWorkflow(filePath)
  }

  function resolveCapabilities(filePath, options = {}) {
    const adapter = resolveForFile(filePath, options)
    if (!adapter) {
      return {
        adapter: null,
        kind: null,
        supportsWorkflow: false,
        supportsPreview: false,
        supportsCompile: false,
        supportedPreviewKinds: [],
        defaultPreviewKind: null,
      }
    }

    const supportedPreviewKinds = Array.isArray(adapter.preview?.supportedKinds)
      ? adapter.preview.supportedKinds.slice()
      : []

    return {
      adapter,
      kind: adapter.kind,
      supportsWorkflow: true,
      supportsPreview: supportedPreviewKinds.length > 0,
      supportsCompile: typeof adapter.compile?.compile === 'function',
      supportedPreviewKinds,
      defaultPreviewKind: adapter.preview?.defaultKind || null,
    }
  }

  return {
    listAll,
    listWorkflowSources,
    resolveByKind,
    resolveForFile,
    resolveCapabilities,
  }
}
