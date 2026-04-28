import { invoke } from '@tauri-apps/api/core'

const REFERENCES_DIRNAME = 'references'
const PDFS_DIRNAME = 'pdfs'
const FULLTEXT_DIRNAME = 'fulltext'

function normalizeRoot(path = '') {
  return String(path || '').trim().replace(/\/+$/, '')
}

function normalizePath(path = '') {
  return String(path || '').trim()
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

async function storeReferencePdfWithOptions(
  globalConfigDir = '',
  reference = {},
  sourcePath = '',
  options = {}
) {
  const normalizedSource = normalizePath(sourcePath)
  if (!globalConfigDir || !normalizedSource) return reference

  return invoke('references_asset_store', {
    params: {
      globalConfigDir,
      reference,
      sourcePath: normalizedSource,
      existingFulltextSourcePath: options.existingFulltextSourcePath || '',
    },
  })
}

export async function storeReferencePdf(globalConfigDir = '', reference = {}, sourcePath = '') {
  return storeReferencePdfWithOptions(globalConfigDir, reference, sourcePath)
}

export async function migrateReferenceAssets(globalConfigDir = '', references = []) {
  if (!globalConfigDir || !Array.isArray(references) || references.length === 0) return references
  const migrated = await invoke('references_assets_migrate', {
    params: {
      globalConfigDir,
      references,
    },
  })
  return Array.isArray(migrated) ? migrated : references
}
