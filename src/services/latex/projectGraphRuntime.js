import { invoke } from '@tauri-apps/api/core'
import {
  normalizeFsPath,
  relativePathBetween,
  stripExtension,
} from '../documentIntelligence/workspaceGraph.js'
import {
  buildLatexProjectGraphCacheKey,
  cacheLatexProjectGraph,
  readCachedLatexProjectGraphEntry,
} from './projectGraphCache.js'
import { listWorkspaceFilesForLatexGraph } from './projectGraphWorkspaceFiles.js'

export async function resolveLatexProjectGraph(sourcePath, options = {}) {
  const normalizedSource = normalizeFsPath(sourcePath)
  if (!normalizedSource) return null

  const flatFiles = await listWorkspaceFilesForLatexGraph({
    ...options,
    sourcePath: normalizedSource,
  })
  const cacheKey = buildLatexProjectGraphCacheKey(normalizedSource, {
    ...options,
    flatFiles,
  })
  const cached = readCachedLatexProjectGraphEntry(normalizedSource)
  if (cached?.key === cacheKey) return cached.graph

  const graph = await invoke('latex_project_graph_resolve', {
    params: {
      sourcePath: normalizedSource,
      flatFiles,
      contentOverrides: options.contentOverrides || {},
    },
  }).catch(() => null)

  if (!graph || typeof graph !== 'object') return null
  cacheLatexProjectGraph(normalizedSource, cacheKey, graph)
  return graph
}

export function buildRelativeLatexInputPath(fromFilePath, targetPath) {
  const relative = relativePathBetween(fromFilePath, targetPath)
  return stripExtension(relative)
}

export async function resolveLatexCompileTargetsForChange(changedPath, options = {}) {
  const normalizedChangedPath = normalizeFsPath(changedPath)
  if (!normalizedChangedPath) return []

  const flatFiles = await listWorkspaceFilesForLatexGraph({
    ...options,
    sourcePath: normalizedChangedPath,
  })

  const targets = await invoke('latex_compile_targets_resolve', {
    params: {
      changedPath: normalizedChangedPath,
      flatFiles,
      contentOverrides: options.contentOverrides || {},
    },
  }).catch(() => [])

  return Array.isArray(targets)
    ? targets.filter((entry) => entry && typeof entry === 'object' && entry.rootPath)
    : []
}
