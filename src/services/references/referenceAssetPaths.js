const REFERENCES_DIRNAME = 'references'
const PDFS_DIRNAME = 'pdfs'
const FULLTEXT_DIRNAME = 'fulltext'

function normalizeRoot(path = '') {
  return String(path || '').trim().replace(/\/+$/, '')
}

export function resolveGlobalReferencesDir(globalConfigDir = '') {
  const base = normalizeRoot(globalConfigDir)
  return base ? `${base}/${REFERENCES_DIRNAME}` : ''
}

export function resolveGlobalReferencePdfsDir(globalConfigDir = '') {
  const base = resolveGlobalReferencesDir(globalConfigDir)
  return base ? `${base}/${PDFS_DIRNAME}` : ''
}

export function resolveGlobalReferenceFulltextDir(globalConfigDir = '') {
  const base = resolveGlobalReferencesDir(globalConfigDir)
  return base ? `${base}/${FULLTEXT_DIRNAME}` : ''
}
