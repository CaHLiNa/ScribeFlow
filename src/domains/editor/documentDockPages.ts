export const DOCUMENT_DOCK_PREVIEW_PAGE = 'preview'
export const DOCUMENT_DOCK_REFERENCES_PAGE = 'references'
export const DOCUMENT_DOCK_PROBLEMS_PAGE = 'problems'
export const DOCUMENT_DOCK_FILE_PAGE = 'file'

const DOCUMENT_DOCK_FILE_PREFIX = 'file:'

export function documentDockFileKey(path = '') {
  return `${DOCUMENT_DOCK_FILE_PREFIX}${path}`
}

export function documentDockFilePathFromKey(key = '') {
  const normalizedKey = String(key || '')
  return normalizedKey.startsWith(DOCUMENT_DOCK_FILE_PREFIX)
    ? normalizedKey.slice(DOCUMENT_DOCK_FILE_PREFIX.length)
    : ''
}

export function isDocumentDockFileKey(key = '') {
  return String(key || '').startsWith(DOCUMENT_DOCK_FILE_PREFIX)
}
