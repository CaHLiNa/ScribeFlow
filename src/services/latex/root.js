import {
  getCachedLatexPreviewPath,
  getCachedLatexRootPath,
  resolveLatexProjectGraph,
} from './projectGraph.js'

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

export async function resolveLatexPreviewArtifact(sourcePath, options = {}) {
  const graph = await resolveLatexProjectGraph(sourcePath, options)
  return graph?.previewPath || resolveCachedLatexPreviewPath(sourcePath)
}
