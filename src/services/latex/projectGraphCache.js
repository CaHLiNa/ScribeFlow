import { stripExtension } from '../documentIntelligence/workspaceGraph.js'
import { normalizeFsPath } from '../documentIntelligence/workspaceGraph.js'

const SOURCE_GRAPH_CACHE = new Map()

export function stableContentFingerprint(value = '') {
  const text = String(value || '')
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`
}

export function buildLatexProjectGraphCacheKey(sourcePath, options = {}) {
  const normalizedSource = normalizeFsPath(sourcePath)
  const flatFiles = Array.isArray(options.flatFiles)
    ? options.flatFiles.map((entry) => normalizeFsPath(entry.path || entry)).filter(Boolean)
    : []
  const overrideEntries = Object.entries(options.contentOverrides || {})
    .map(([path, content]) => ({
      path: normalizeFsPath(path),
      fingerprint: stableContentFingerprint(content),
    }))
    .filter((entry) => entry.path)
    .sort((left, right) => left.path.localeCompare(right.path))
  return JSON.stringify({
    sourcePath: normalizedSource,
    flatFiles,
    overrideEntries,
  })
}

export function readCachedLatexProjectGraphEntry(sourcePath = '') {
  const normalized = normalizeFsPath(sourcePath)
  return SOURCE_GRAPH_CACHE.get(normalized) || null
}

export function cacheLatexProjectGraph(sourcePath = '', key = '', graph = null) {
  const normalized = normalizeFsPath(sourcePath)
  if (!normalized || !graph || typeof graph !== 'object') return
  SOURCE_GRAPH_CACHE.set(normalized, {
    key,
    graph,
  })
}

export function getCachedLatexProjectGraph(sourcePath = '') {
  return readCachedLatexProjectGraphEntry(sourcePath)?.graph || null
}

export function getCachedLatexRootPath(sourcePath = '') {
  return getCachedLatexProjectGraph(sourcePath)?.rootPath || normalizeFsPath(sourcePath)
}

export function getCachedLatexPreviewPath(sourcePath = '') {
  return getCachedLatexProjectGraph(sourcePath)?.previewPath || `${stripExtension(sourcePath)}.pdf`
}
