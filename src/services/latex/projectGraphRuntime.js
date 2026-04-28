import { invoke } from '@tauri-apps/api/core'
import {
  normalizeFsPath,
  relativePathBetween,
  stripExtension,
  uniqueBy,
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

export async function resolveLatexProjectContext(sourcePath, options = {}) {
  return resolveLatexProjectGraph(sourcePath, options)
}

export async function resolveLatexOutlineItems(sourcePath, options = {}) {
  const normalizedSource = normalizeFsPath(sourcePath)
  if (!normalizedSource) return []

  const contentOverrides = options.sourceContent === undefined
    ? (options.contentOverrides || {})
    : {
        ...(options.contentOverrides || {}),
        [normalizedSource]: options.sourceContent,
      }

  const graph = await resolveLatexProjectGraph(normalizedSource, {
    ...options,
    contentOverrides,
  }).catch(() => null)

  return Array.isArray(graph?.outlineItems) ? graph.outlineItems : []
}

export function buildRelativeLatexInputPath(fromFilePath, targetPath) {
  const relative = relativePathBetween(fromFilePath, targetPath)
  return stripExtension(relative)
}

export async function resolveLatexAffectedRootTargets(changedPath, options = {}) {
  const normalizedChangedPath = normalizeFsPath(changedPath)
  if (!normalizedChangedPath) return []

  const flatFiles = await listWorkspaceFilesForLatexGraph({
    ...options,
    sourcePath: normalizedChangedPath,
  })
  const latexFiles = flatFiles.filter((path) => {
    const normalized = path.toLowerCase()
    return normalized.endsWith('.tex') || normalized.endsWith('.latex')
  })
  const affectedRoots = new Map()

  for (const filePath of latexFiles) {
    const graph = await resolveLatexProjectGraph(filePath, {
      ...options,
      flatFiles,
    }).catch(() => null)
    if (!graph?.rootPath) continue

    const touchesSource = Array.isArray(graph.projectPaths) && graph.projectPaths.includes(normalizedChangedPath)
    const touchesBibliography = Array.isArray(graph.bibliographyFiles) && graph.bibliographyFiles.includes(normalizedChangedPath)
    if (!touchesSource && !touchesBibliography) continue

    if (!affectedRoots.has(graph.rootPath)) {
      affectedRoots.set(graph.rootPath, {
        sourcePath: graph.rootPath,
        rootPath: graph.rootPath,
        previewPath: graph.previewPath || `${stripExtension(graph.rootPath)}.pdf`,
      })
    }
  }

  return uniqueBy([...affectedRoots.values()], (entry) => entry.rootPath)
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
    ? uniqueBy(
        targets
          .filter((entry) => entry && typeof entry === 'object')
          .map((entry) => ({
            sourcePath: normalizeFsPath(entry.sourcePath || normalizedChangedPath),
            rootPath: normalizeFsPath(entry.rootPath || entry.sourcePath || normalizedChangedPath),
            previewPath: normalizeFsPath(
              entry.previewPath
              || `${stripExtension(entry.rootPath || entry.sourcePath || normalizedChangedPath)}.pdf`,
            ),
          }))
          .filter((entry) => entry.rootPath),
        (entry) => entry.rootPath,
      )
    : []
}
