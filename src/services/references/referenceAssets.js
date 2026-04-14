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

function sanitizeAssetSegment(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function resolveAssetBaseName(reference = {}) {
  const primary = sanitizeAssetSegment(reference.citationKey || reference.id || reference.title || '')
  return primary || `reference-${Date.now()}`
}

function resolveFileExtension(filePath = '', fallback = '.pdf') {
  const normalized = normalizePath(filePath)
  const lastDot = normalized.lastIndexOf('.')
  if (lastDot === -1) return fallback
  const extension = normalized.slice(lastDot).toLowerCase()
  return extension || fallback
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

export async function storeReferencePdf(globalConfigDir = '', reference = {}, sourcePath = '') {
  const normalizedSource = normalizePath(sourcePath)
  if (!globalConfigDir || !normalizedSource) return reference

  await ensureGlobalReferenceAssetDirs(globalConfigDir)

  const pdfsDir = resolveGlobalReferencePdfsDir(globalConfigDir)
  const fulltextDir = resolveGlobalReferenceFulltextDir(globalConfigDir)
  const extension = resolveFileExtension(normalizedSource, '.pdf')
  const baseName = resolveAssetBaseName(reference)
  const destPdfPath = `${pdfsDir}/${baseName}${extension}`
  const destTextPath = `${fulltextDir}/${baseName}.txt`

  if (normalizeRoot(normalizedSource) !== normalizeRoot(destPdfPath)) {
    await invoke('copy_file', { src: normalizedSource, dest: destPdfPath })
  }

  let fulltextPath = ''
  try {
    const text = await extractTextFromPdf(destPdfPath)
    if (text.trim()) {
      await invoke('write_file', { path: destTextPath, content: text })
      fulltextPath = destTextPath
    }
  } catch (error) {
    console.warn('[references] Failed to extract full text from PDF:', error)
  }

  return {
    ...reference,
    pdfPath: destPdfPath,
    hasPdf: true,
    fulltextPath,
    hasFullText: Boolean(fulltextPath),
  }
}

export async function migrateReferenceAssets(globalConfigDir = '', references = []) {
  if (!globalConfigDir || !Array.isArray(references) || references.length === 0) return references

  const pdfsDir = resolveGlobalReferencePdfsDir(globalConfigDir)
  const fulltextDir = resolveGlobalReferenceFulltextDir(globalConfigDir)
  await ensureGlobalReferenceAssetDirs(globalConfigDir)

  const migrated = []
  for (const reference of references) {
    const pdfPath = normalizePath(reference.pdfPath)
    const fulltextPath = normalizePath(reference.fulltextPath)

    if (!pdfPath || isWithinDirectory(pdfPath, pdfsDir)) {
      migrated.push(reference)
      continue
    }

    try {
      const nextReference = await storeReferencePdf(globalConfigDir, reference, pdfPath)
      if (fulltextPath && !nextReference.fulltextPath) {
        const destFulltextPath = `${fulltextDir}/${resolveAssetBaseName(reference)}.txt`
        await invoke('copy_file', { src: fulltextPath, dest: destFulltextPath }).catch(() => {})
        nextReference.fulltextPath = destFulltextPath
        nextReference.hasFullText = true
      }
      migrated.push(nextReference)
    } catch (error) {
      console.warn('[references] Failed to migrate project reference assets:', error)
      migrated.push(reference)
    }
  }

  return migrated
}
