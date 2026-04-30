function normalizeValue(value = '') {
  return String(value || '').trim()
}

function normalizePath(value = '') {
  return normalizeValue(value).replace(/\\/g, '/')
}

function basename(path = '') {
  const normalized = normalizePath(path)
  return normalized.split('/').filter(Boolean).pop() || normalized
}

function dirname(path = '') {
  const normalized = normalizePath(path)
  const index = normalized.lastIndexOf('/')
  return index > 0 ? normalized.slice(0, index) : ''
}

function extname(path = '') {
  const name = basename(path)
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index).toLowerCase() : ''
}

function schemeForPath(path = '') {
  const normalized = normalizePath(path)
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
    return normalized.slice(0, normalized.indexOf(':')).toLowerCase()
  }
  return normalized ? 'file' : ''
}

function languageIdForPath(path = '') {
  const extension = extname(path)
  if (extension === '.pdf') return 'pdf'
  if (extension === '.md' || extension === '.markdown') return 'markdown'
  if (extension === '.tex' || extension === '.latex') return 'latex'
  if (extension === '.py') return 'python'
  if (extension === '.bib') return 'bibtex'
  if (extension === '.json') return 'json'
  if (extension === '.csv') return 'csv'
  if (extension === '.txt') return 'plaintext'
  return extension ? extension.slice(1) : ''
}

function resourceKindForTarget(kind = '', path = '') {
  const normalizedKind = normalizeValue(kind)
  const extension = extname(path)
  if (normalizedKind.toLowerCase().includes('pdf') || extension === '.pdf') return 'pdf'
  if (extension === '.md' || extension === '.markdown') return 'markdown'
  if (extension === '.tex' || extension === '.latex') return 'latex'
  if (extension === '.py') return 'python'
  return normalizedKind || (path ? 'file' : '')
}

export function buildExtensionContext(target = {}, extra = {}) {
  const path = normalizePath(target?.path)
  const targetKind = normalizeValue(target?.kind)
  const resourceKind = resourceKindForTarget(targetKind, path)
  const resourceExtname = extname(path)
  const resourceFilename = basename(path)
  const resourceDirname = dirname(path)
  const resourceLangId = languageIdForPath(path)
  const resourceScheme = schemeForPath(path)
  const referenceId = normalizeValue(target?.referenceId)
  const workbench = {
    surface: normalizeValue(extra?.workbench?.surface),
    panel: normalizeValue(extra?.workbench?.panel),
    activeView: normalizeValue(extra?.workbench?.activeView || extra?.activeView),
    hasWorkspace: Boolean(extra?.workbench?.hasWorkspace),
    workspaceFolder: normalizePath(extra?.workbench?.workspaceFolder || extra?.workspaceFolder),
    ...(extra?.workbench && typeof extra.workbench === 'object' ? extra.workbench : {}),
  }

  return {
    ...extra,
    workbench,
    activeView: workbench.activeView || workbench.panel || workbench.surface,
    workspaceFolder: workbench.workspaceFolder,
    resourceKind,
    resourcePath: path,
    resourceExtname,
    resourceFilename,
    resourceDirname,
    resourceLangId,
    resourceScheme,
    resourceIsPdf: resourceKind === 'pdf',
    resourceIsMarkdown: resourceLangId === 'markdown',
    resourceIsLatex: resourceLangId === 'latex',
    resourceIsPython: resourceLangId === 'python',
    resourceHasReference: Boolean(referenceId),
    resource: {
      kind: resourceKind,
      path,
      targetKind,
      referenceId,
      extname: resourceExtname,
      filename: resourceFilename,
      dirname: resourceDirname,
      langId: resourceLangId,
      scheme: resourceScheme,
      isPdf: resourceKind === 'pdf',
      isMarkdown: resourceLangId === 'markdown',
      isLatex: resourceLangId === 'latex',
      isPython: resourceLangId === 'python',
      ...(extra?.resource && typeof extra.resource === 'object' ? extra.resource : {}),
    },
  }
}
