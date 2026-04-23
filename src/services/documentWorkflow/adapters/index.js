import { isNewTab, isPreviewPath } from '../../../utils/fileTypes.js'
import { markdownDocumentAdapter } from './markdown.js'
import { latexDocumentAdapter } from './latex.js'
import { pythonDocumentAdapter } from './python.js'

const DOCUMENT_ADAPTERS = [
  markdownDocumentAdapter,
  latexDocumentAdapter,
  pythonDocumentAdapter,
]

export function listDocumentAdapters() {
  return DOCUMENT_ADAPTERS.slice()
}

export function listWorkflowDocumentAdapters() {
  return DOCUMENT_ADAPTERS.filter(adapter => typeof adapter.supportsWorkflowSource === 'function')
}

export function getDocumentAdapterByKind(kind) {
  return DOCUMENT_ADAPTERS.find(adapter => adapter.kind === kind) || null
}

export function getDocumentAdapterForFile(filePath) {
  if (!filePath) return null
  return DOCUMENT_ADAPTERS.find(adapter => adapter.matchesFile?.(filePath)) || null
}

export function getDocumentAdapterForWorkflow(filePath) {
  if (!filePath) return null
  if (isPreviewPath(filePath) || isNewTab(filePath)) {
    return null
  }
  return DOCUMENT_ADAPTERS.find(adapter => adapter.supportsWorkflowSource?.(filePath)) || null
}

export function getCompileAdapterForFile(filePath) {
  return getDocumentAdapterForFile(filePath)?.compile || null
}

export function getDocumentAdapterCapabilities(filePath, options = {}) {
  const adapter =
    options.workflowOnly === false
      ? getDocumentAdapterForFile(filePath)
      : getDocumentAdapterForWorkflow(filePath)

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
