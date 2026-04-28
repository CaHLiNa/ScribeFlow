import { resolveGlobalReferencesDir } from './referenceAssetPaths.js'

export const REFERENCE_LIBRARY_FILENAME = 'library.json'

export function resolveLegacyReferencesDataDir(workspaceDataDir = '') {
  const base = String(workspaceDataDir || '').trim().replace(/\/+$/, '')
  if (!base) return ''
  return `${base}/references`
}

export function resolveReferencesDataDir(projectRoot = '') {
  return resolveGlobalReferencesDir(projectRoot)
}

export function resolveLegacyReferenceLibraryFile(workspaceDataDir = '') {
  const dir = resolveLegacyReferencesDataDir(workspaceDataDir)
  if (!dir) return ''
  return `${dir}/${REFERENCE_LIBRARY_FILENAME}`
}

export function resolveProjectLegacyReferencesDataDir(projectRoot = '') {
  const base = String(projectRoot || '').trim().replace(/\/+$/, '')
  if (!base) return ''
  return `${base}/references`
}

export function resolveProjectLegacyReferenceLibraryFile(projectRoot = '') {
  const dir = resolveProjectLegacyReferencesDataDir(projectRoot)
  if (!dir) return ''
  return `${dir}/${REFERENCE_LIBRARY_FILENAME}`
}

export function resolveReferenceLibraryFile(globalConfigDir = '') {
  const dir = resolveReferencesDataDir(globalConfigDir)
  if (!dir) return ''
  return `${dir}/${REFERENCE_LIBRARY_FILENAME}`
}
