import { invoke } from '@tauri-apps/api/core'
import {
  normalizeFsPath,
  relativePathBetween,
  stripExtension,
} from '../documentIntelligence/workspaceGraph.js'

const GRAPH_MIRROR = new Map()

function listCachedWorkspaceFiles(options = {}) {
  const filesStore = options.filesStore

  if (Array.isArray(options.flatFiles) && options.flatFiles.length > 0) {
    return options.flatFiles.map((entry) => normalizeFsPath(entry.path || entry)).filter(Boolean)
  }

  const cachedSnapshotPaths = (filesStore?.lastWorkspaceSnapshot?.flatFiles || [])
    .map((entry) => normalizeFsPath(entry?.path || entry))
    .filter(Boolean)
  if (cachedSnapshotPaths.length > 0) return cachedSnapshotPaths

  const cachedFlatFiles = Array.isArray(filesStore?.flatFiles) ? filesStore.flatFiles : []
  return cachedFlatFiles
    .map((entry) => normalizeFsPath(entry.path || entry))
    .filter(Boolean)
}

export function getCachedLatexProjectGraph(sourcePath = '') {
  const normalized = normalizeFsPath(sourcePath)
  return GRAPH_MIRROR.get(normalized) || null
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

  const flatFiles = listCachedWorkspaceFiles({
    ...options,
    sourcePath: normalizedSource,
  })
  const workspacePath = normalizeFsPath(options.workspacePath || '')

  const graph = await invoke('latex_project_graph_resolve', {
    params: {
      sourcePath: normalizedSource,
      workspacePath,
      flatFiles,
      contentOverrides: options.contentOverrides || {},
    },
  }).catch(() => null)

  if (!graph || typeof graph !== 'object') return null
  GRAPH_MIRROR.set(normalizedSource, graph)
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
