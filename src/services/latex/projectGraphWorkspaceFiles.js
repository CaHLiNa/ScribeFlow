import { readWorkspaceFlatFiles } from '../workspaceSnapshotIO.js'
import { listWorkspaceFlatFilePaths } from '../../domains/files/workspaceSnapshotFlatFilesRuntime.js'
import { normalizeFsPath } from '../documentIntelligence/workspaceGraph.js'

export async function listWorkspaceFilesForLatexGraph(options = {}) {
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
