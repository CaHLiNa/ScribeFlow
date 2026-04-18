import { isNewTab, isPreviewPath } from '../../../utils/fileTypes.js'
import { markdownDocumentAdapter } from './markdown.js'
import { latexDocumentAdapter } from './latex.js'

const DOCUMENT_ADAPTERS = [
  markdownDocumentAdapter,
  latexDocumentAdapter,
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
