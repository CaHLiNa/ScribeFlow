import { isNewTab, isPreviewPath } from '../../utils/fileTypes.js'

export function getDocumentWorkflowKind(path) {
  if (!path || typeof path !== 'string') return null
  if (isPreviewPath(path) || isNewTab(path)) return null
  const lower = path.toLowerCase()
  if (lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.qmd') || lower.endsWith('.rmd')) {
    return 'markdown'
  }
  if (lower.endsWith('.tex') || lower.endsWith('.latex')) return 'latex'
  if (lower.endsWith('.py')) return 'python'
  return null
}

export function isDocumentWorkflowSource(path) {
  return getDocumentWorkflowKind(path) !== null
}

export function getSupportedWorkflowPreviewKinds(kind) {
  if (kind === 'markdown') return ['html']
  if (kind === 'latex') return ['pdf']
  if (kind === 'python') return ['terminal']
  return []
}

export function getDefaultWorkflowPreviewKind(kind) {
  if (kind === 'markdown') return 'html'
  if (kind === 'python') return 'terminal'
  return null
}

export function getPreferredWorkflowPreviewKind(kind, prefs = {}) {
  const preferred = prefs?.[kind]?.preferredPreview
  const supported = getSupportedWorkflowPreviewKinds(kind)
  if (preferred && supported.includes(preferred)) return preferred
  return getDefaultWorkflowPreviewKind(kind)
}

export function createWorkflowPreviewPath(sourcePath, kind, previewKind) {
  if (!sourcePath) return null
  const resolvedKind = previewKind || getDefaultWorkflowPreviewKind(kind)
  if (kind === 'markdown' && resolvedKind === 'html') return `preview:${sourcePath}`
  return null
}

export function inferWorkflowPreviewKind(sourcePath, previewPath) {
  const kind = getDocumentWorkflowKind(sourcePath)
  if (!kind || !previewPath) return null
  const supportedKinds = getSupportedWorkflowPreviewKinds(kind)
  return supportedKinds.find((previewKind) => {
    return createWorkflowPreviewPath(sourcePath, kind, previewKind) === previewPath
  }) || null
}
