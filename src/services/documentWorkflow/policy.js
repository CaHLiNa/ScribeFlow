import {
  getDocumentAdapterByKind,
  getDocumentAdapterForWorkflow,
} from './adapters/index.js'

export function getDocumentWorkflowKind(path) {
  if (!path || typeof path !== 'string') return null
  if (
    path.startsWith('preview:')
    || path.startsWith('chat:')
    || path.startsWith('newtab:')
    || path.startsWith('ref:@')
  ) {
    return null
  }

  return getDocumentAdapterForWorkflow(path)?.kind || null
}

export function isDocumentWorkflowSource(path) {
  return getDocumentWorkflowKind(path) !== null
}

function getDefaultWorkflowPreviewKind(kind) {
  return getDocumentAdapterByKind(kind)?.preview?.defaultKind || null
}

export function getPreferredWorkflowPreviewKind(kind, prefs = {}) {
  const preferred = prefs?.[kind]?.preferredPreview
  const adapter = getDocumentAdapterByKind(kind)
  const supportedKinds = adapter?.preview?.supportedKinds || []
  if (preferred && supportedKinds.includes(preferred)) return preferred
  return getDefaultWorkflowPreviewKind(kind)
}

export function createWorkflowPreviewPath(sourcePath, kind, previewKind) {
  if (!sourcePath) return null
  const adapter = (kind ? getDocumentAdapterByKind(kind) : null) || getDocumentAdapterForWorkflow(sourcePath)
  const resolvedPreviewKind = previewKind || adapter?.preview?.defaultKind || null
  if (!adapter?.preview || !resolvedPreviewKind) return null
  return adapter.preview.createPath(sourcePath, resolvedPreviewKind)
}

export function inferWorkflowPreviewKind(sourcePath, previewPath) {
  const adapter = getDocumentAdapterForWorkflow(sourcePath)
  if (!adapter?.preview || !previewPath) return null
  return adapter.preview.inferKind(sourcePath, previewPath)
}
