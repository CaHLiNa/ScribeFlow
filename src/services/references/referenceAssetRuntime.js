import { invoke } from '@tauri-apps/api/core'
import { extractTextFromPdf } from './pdfMetadata.js'
import {
  resolveGlobalReferencesDir,
  resolveGlobalReferencePdfsDir,
  resolveGlobalReferenceFulltextDir,
} from './referenceAssetPaths.js'

function normalizePath(path = '') {
  return String(path || '').trim()
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
