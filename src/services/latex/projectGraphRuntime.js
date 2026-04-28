import { invoke } from '@tauri-apps/api/core'
import {
  normalizeFsPath,
  relativePathBetween,
  stripExtension,
} from '../documentIntelligence/workspaceGraph.js'
import { listWorkspaceFlatFilePaths } from '../../domains/files/workspaceSnapshotFlatFilesRuntime.js'
import {
  buildLatexProjectGraphCacheKey,
  cacheLatexProjectGraph,
  readCachedLatexProjectGraphEntry,
} from './projectGraphCache.js'

function resolveGraphCacheFlatFiles(options = {}) {
  if (Array.isArray(options.flatFiles) && options.flatFiles.length > 0) {
    return options.flatFiles
      .map((entry) => normalizeFsPath(entry.path || entry))
      .filter(Boolean)
  }

  const snapshotPaths = listWorkspaceFlatFilePaths(options.filesStore?.lastWorkspaceSnapshot)
    .map((entry) => normalizeFsPath(entry))
    .filter(Boolean)
  if (snapshotPaths.length > 0) return snapshotPaths

  return Array.isArray(options.filesStore?.flatFiles)
    ? options.filesStore.flatFiles
        .map((entry) => normalizeFsPath(entry.path || entry))
        .filter(Boolean)
    : []
}

export async function resolveLatexProjectGraph(sourcePath, options = {}) {
  const normalizedSource = normalizeFsPath(sourcePath)
  if (!normalizedSource) return null

  const cacheFlatFiles = resolveGraphCacheFlatFiles(options)
  const cacheKey = cacheFlatFiles.length > 0
    ? buildLatexProjectGraphCacheKey(normalizedSource, {
        ...options,
        flatFiles: cacheFlatFiles,
      })
    : ''
  const cached = cacheKey ? readCachedLatexProjectGraphEntry(normalizedSource) : null
  if (cacheKey && cached?.key === cacheKey) return cached.graph

  const graph = await invoke('latex_project_graph_resolve', {
    params: {
      sourcePath: normalizedSource,
      workspacePath: normalizeFsPath(options.workspacePath || ''),
      flatFiles: Array.isArray(options.flatFiles)
        ? options.flatFiles
            .map((entry) => normalizeFsPath(entry.path || entry))
            .filter(Boolean)
        : [],
      includeHidden: options.includeHidden !== false,
      contentOverrides: options.contentOverrides || {},
    },
  }).catch(() => null)

  if (!graph || typeof graph !== 'object') return null
  if (cacheKey) {
    cacheLatexProjectGraph(normalizedSource, cacheKey, graph)
  }
  return graph
}

export function buildRelativeLatexInputPath(fromFilePath, targetPath) {
  const relative = relativePathBetween(fromFilePath, targetPath)
  return stripExtension(relative)
}

export async function resolveLatexCompileTargetsForChange(changedPath, options = {}) {
  const normalizedChangedPath = normalizeFsPath(changedPath)
  if (!normalizedChangedPath) return []

  const targets = await invoke('latex_compile_targets_resolve', {
    params: {
      changedPath: normalizedChangedPath,
      workspacePath: normalizeFsPath(options.workspacePath || ''),
      flatFiles: Array.isArray(options.flatFiles)
        ? options.flatFiles
            .map((entry) => normalizeFsPath(entry.path || entry))
            .filter(Boolean)
        : [],
      includeHidden: options.includeHidden !== false,
      contentOverrides: options.contentOverrides || {},
    },
  }).catch(() => [])

  return Array.isArray(targets)
    ? targets.filter((entry) => entry && typeof entry === 'object' && entry.rootPath)
    : []
}
