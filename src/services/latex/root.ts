import {
  getCachedLatexPreviewPath,
  getCachedLatexRootPath,
  resolveLatexProjectGraph,
} from './projectGraph.ts'
import { normalizeFsPath } from '../documentIntelligence/workspaceGraph.ts'

export function resolveCachedLatexRootPath(sourcePath = '') {
  return getCachedLatexRootPath(sourcePath)
}

export function resolveCachedLatexPreviewPath(sourcePath = '') {
  return getCachedLatexPreviewPath(sourcePath)
}

export async function resolveLatexCompileTarget(sourcePath, options = {}) {
  const graph = await resolveLatexProjectGraph(sourcePath, options)
  return graph?.rootPath || sourcePath
}

export async function resolveLatexReferenceScopePath(sourcePath, options = {}) {
  const normalizedSource = normalizeFsPath(sourcePath)
  if (!normalizedSource) return ''

  const graph = await resolveLatexProjectGraph(normalizedSource, options).catch(() => null)
  return normalizeFsPath(graph?.rootPath || getCachedLatexRootPath(normalizedSource) || normalizedSource)
}

export async function resolveLatexReferenceContext(sourcePath, options = {}) {
  const normalizedSource = normalizeFsPath(sourcePath)
  if (!normalizedSource) {
    return {
      referenceScopePath: '',
      citedKeys: [],
    }
  }

  const graph = await resolveLatexProjectGraph(normalizedSource, options).catch(() => null)
  const referenceScopePath = normalizeFsPath(
    graph?.rootPath || getCachedLatexRootPath(normalizedSource) || normalizedSource
  )
  const seen = new Set()
  const citedKeys = (Array.isArray(graph?.citations) ? graph.citations : [])
    .map((citation) => String(citation?.key || '').trim())
    .filter((key) => {
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })

  return {
    referenceScopePath,
    citedKeys,
  }
}

export async function resolveLatexPreviewArtifact(sourcePath, options = {}) {
  const graph = await resolveLatexProjectGraph(sourcePath, options)
  return graph?.previewPath || resolveCachedLatexPreviewPath(sourcePath)
}
