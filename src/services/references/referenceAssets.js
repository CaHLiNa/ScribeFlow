import { invoke } from '@tauri-apps/api/core'
import { extractTextFromPdf } from './pdfMetadata.js'

const REFERENCES_DIRNAME = 'references'
const PDFS_DIRNAME = 'pdfs'
const FULLTEXT_DIRNAME = 'fulltext'

function normalizeRoot(path = '') {
  return String(path || '').trim().replace(/\/+$/, '')
}

function normalizePath(path = '') {
  return String(path || '').trim()
}

function isWithinDirectory(path = '', root = '') {
  const normalizedPath = normalizeRoot(path)
  const normalizedRoot = normalizeRoot(root)
  if (!normalizedPath || !normalizedRoot) return false
  if (normalizedPath === normalizedRoot) return true
  return normalizedPath.startsWith(`${normalizedRoot}/`)
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

export async function ensureGlobalReferenceAssetDirs(globalConfigDir = '') {
  const referencesDir = resolveGlobalReferencesDir(globalConfigDir)
  const pdfsDir = resolveGlobalReferencePdfsDir(globalConfigDir)
  const fulltextDir = resolveGlobalReferenceFulltextDir(globalConfigDir)
  if (!referencesDir || !pdfsDir || !fulltextDir) return

  await invoke('create_dir', { path: referencesDir })
  await invoke('create_dir', { path: pdfsDir })
  await invoke('create_dir', { path: fulltextDir })
}

async function storeReferencePdfWithOptions(
  globalConfigDir = '',
  reference = {},
  sourcePath = '',
  options = {}
) {
  const normalizedSource = normalizePath(sourcePath)
  if (!globalConfigDir || !normalizedSource) return reference

  let extractedText = ''
  try {
    extractedText = await extractTextFromPdf(normalizedSource)
  } catch (error) {
    console.warn('[references] Failed to extract full text from PDF:', error)
  }

  return invoke('references_asset_store', {
    params: {
      globalConfigDir,
      reference,
      sourcePath: normalizedSource,
      extractedText,
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
