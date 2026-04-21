import { invoke } from '@tauri-apps/api/core'
import { readWorkspaceFlatFiles } from '../workspaceSnapshotIO.js'
import { listWorkspaceFlatFilePaths } from '../../domains/files/workspaceSnapshotFlatFilesRuntime.js'
import {
  normalizeFsPath,
  relativePathBetween,
  stripExtension,
  uniqueBy,
} from '../documentIntelligence/workspaceGraph.js'

const SOURCE_GRAPH_CACHE = new Map()

function stableContentFingerprint(value = '') {
  const text = String(value || '')
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`
}

async function listWorkspaceFiles(options = {}) {
  const workspacePath = normalizeFsPath(options.workspacePath || '')
  const filesStore = options.filesStore

  if (Array.isArray(options.flatFiles) && options.flatFiles.length > 0) {
    return options.flatFiles.map((entry) => normalizeFsPath(entry.path || entry)).filter(Boolean)
  }

  const cachedSnapshotPaths = listWorkspaceFlatFilePaths(filesStore?.lastWorkspaceSnapshot)
    .map((entry) => normalizeFsPath(entry))
    .filter(Boolean)
  if (cachedSnapshotPaths.length > 0) return cachedSnapshotPaths

  const cachedFlatFiles = Array.isArray(filesStore?.flatFiles) ? filesStore.flatFiles : []
  const cachedFlatFilePaths = cachedFlatFiles
    .map((entry) => normalizeFsPath(entry.path || entry))
    .filter(Boolean)
  if (cachedFlatFilePaths.length > 0) return cachedFlatFilePaths

  if (filesStore?.ensureFlatFilesReady) {
    const entries = await filesStore.ensureFlatFilesReady().catch(() => [])
    const normalized = Array.isArray(entries)
      ? entries.map((entry) => normalizeFsPath(entry.path || entry)).filter(Boolean)
      : []
    if (normalized.length > 0) return normalized
  }

  if (!workspacePath) return [normalizeFsPath(options.sourcePath || '')].filter(Boolean)
  const entries = await readWorkspaceFlatFiles(workspacePath).catch(() => [])
  return Array.isArray(entries)
    ? entries.map((entry) => normalizeFsPath(entry.path || entry)).filter(Boolean)
    : []
}

function buildGraphCacheKey(sourcePath, options = {}) {
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

export function getCachedLatexProjectGraph(sourcePath = '') {
  const normalized = normalizeFsPath(sourcePath)
  return SOURCE_GRAPH_CACHE.get(normalized)?.graph || null
}

export function getCachedLatexRootPath(sourcePath = '') {
  return getCachedLatexProjectGraph(sourcePath)?.rootPath || normalizeFsPath(sourcePath)
}

export function getCachedLatexPreviewPath(sourcePath = '') {
  return getCachedLatexProjectGraph(sourcePath)?.previewPath || `${stripExtension(sourcePath)}.pdf`
}

export async function resolveLatexProjectGraph(sourcePath, options = {}) {
  const normalizedSource = normalizeFsPath(sourcePath)
  if (!normalizedSource) return null

  const flatFiles = await listWorkspaceFiles({
    ...options,
    sourcePath: normalizedSource,
  })
  const cacheKey = buildGraphCacheKey(normalizedSource, {
    ...options,
    flatFiles,
  })
  const cached = SOURCE_GRAPH_CACHE.get(normalizedSource)
  if (cached?.key === cacheKey) return cached.graph

  const graph = await invoke('latex_project_graph_resolve', {
    params: {
      sourcePath: normalizedSource,
      flatFiles,
      contentOverrides: options.contentOverrides || {},
    },
  }).catch(() => null)

  if (!graph || typeof graph !== 'object') return null
  SOURCE_GRAPH_CACHE.set(normalizedSource, {
    key: cacheKey,
    graph,
  })
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

  const flatFiles = await listWorkspaceFiles({
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

  const flatFiles = await listWorkspaceFiles({
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
