function extOf(path = '') {
  const source = String(path)
    .replace(/^preview:/, '')
    .split('/')
    .pop() || ''
  const dot = source.lastIndexOf('.')
  return dot > 0 ? source.slice(dot + 1).toLowerCase() : ''
}

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

  const ext = extOf(path)
  if (ext === 'md') return 'markdown'
  if (ext === 'tex' || ext === 'latex') return 'latex'
  if (ext === 'typ') return 'typst'
  return null
}

export function isDocumentWorkflowSource(path) {
  return getDocumentWorkflowKind(path) !== null
}

export function getDefaultWorkflowPreviewKind(kind) {
  if (kind === 'markdown') return 'html'
  if (kind === 'latex' || kind === 'typst') return 'pdf'
  return null
}

export function getPreferredWorkflowPreviewKind(kind, prefs = {}) {
  const preferred = prefs?.[kind]?.preferredPreview
  return preferred || getDefaultWorkflowPreviewKind(kind)
}

export function createWorkflowPreviewPath(sourcePath, kind, previewKind) {
  if (!sourcePath || !kind || !previewKind) return null

  if (kind === 'markdown') {
    if (previewKind === 'html') return `preview:${sourcePath}`
    if (previewKind === 'pdf') return sourcePath.replace(/\.md$/i, '.pdf')
  }

  if (kind === 'latex' && previewKind === 'pdf') {
    return sourcePath.replace(/\.(tex|latex)$/i, '.pdf')
  }

  if (kind === 'typst' && previewKind === 'pdf') {
    return sourcePath.replace(/\.typ$/i, '.pdf')
  }

  return null
}

export function inferWorkflowPreviewKind(sourcePath, previewPath) {
  const kind = getDocumentWorkflowKind(sourcePath)
  if (!kind || !previewPath) return null

  if (previewPath === createWorkflowPreviewPath(sourcePath, kind, 'html')) {
    return 'html'
  }
  if (previewPath === createWorkflowPreviewPath(sourcePath, kind, 'pdf')) {
    return 'pdf'
  }
  return null
}
