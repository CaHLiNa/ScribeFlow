import { isChatTab, isNewTab, isPreviewPath, isReferencePath } from '../../../utils/fileTypes.js'
import { markdownDocumentAdapter } from './markdown.js'
import { latexDocumentAdapter } from './latex.js'
import { typstDocumentAdapter } from './typst.js'

const DOCUMENT_ADAPTERS = [
  markdownDocumentAdapter,
  latexDocumentAdapter,
  typstDocumentAdapter,
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
  if (
    isPreviewPath(filePath)
    || isChatTab(filePath)
    || isNewTab(filePath)
    || isReferencePath(filePath)
  ) {
    return null
  }
  return DOCUMENT_ADAPTERS.find(adapter => adapter.supportsWorkflowSource?.(filePath)) || null
}

export function getCompileAdapterForFile(filePath) {
  return getDocumentAdapterForFile(filePath)?.compile || null
}
