import { isBinaryFile } from '../../utils/fileTypes.js'
import { listWorkspaceFlatFilePaths } from '../files/workspaceSnapshotFlatFilesRuntime.js'
import { createWorkspaceHistoryPreparationRuntime } from './workspaceHistoryPreparationRuntime.js'

function normalizePathValue(value = '') {
  return String(value || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')
}

function normalizeFlatFilePath(entry = null) {
  if (typeof entry === 'string') {
    return normalizePathValue(entry)
  }

  return normalizePathValue(entry?.path)
}

function isWorkspaceFilePath(filePath = '', workspacePath = '') {
  const normalizedFilePath = normalizePathValue(filePath)
  const normalizedWorkspacePath = normalizePathValue(workspacePath)
  if (!normalizedFilePath || !normalizedWorkspacePath) {
    return false
  }

  return normalizedFilePath === normalizedWorkspacePath
    || normalizedFilePath.startsWith(`${normalizedWorkspacePath}/`)
}

function sortUniquePaths(paths = []) {
  return Array.from(new Set(paths.map((path) => normalizePathValue(path)).filter(Boolean))).sort()
}

export function createWorkspaceSnapshotProjectTextRuntime({
  historyPreparationRuntime = createWorkspaceHistoryPreparationRuntime(),
  isBinaryPathImpl = isBinaryFile,
} = {}) {
  function isWorkspaceProjectTextPath(filePath = '', workspacePath = '') {
    const normalizedPath = normalizePathValue(filePath)
    return !!normalizedPath
      && historyPreparationRuntime.isPersistableHistoryPath(normalizedPath)
      && isWorkspaceFilePath(normalizedPath, workspacePath)
      && !isBinaryPathImpl(normalizedPath)
  }

  function listLoadedWorkspaceTextPaths({
    workspacePath = '',
    editorStore,
    filesStore,
  } = {}) {
    const allOpenFiles = Array.from(editorStore?.allOpenFiles || [])
    const cachedWorkspaceTextFiles = Object.entries(filesStore?.fileContents || {})
      .filter(([, content]) => typeof content === 'string')
      .map(([filePath]) => filePath)

    return sortUniquePaths([...allOpenFiles, ...cachedWorkspaceTextFiles].filter((filePath) =>
      isWorkspaceProjectTextPath(filePath, workspacePath)
    ))
  }

  function listIndexedWorkspaceProjectTextPaths({
    workspacePath = '',
    snapshot = null,
    flatFiles = [],
  } = {}) {
    const indexedPaths = snapshot
      ? listWorkspaceFlatFilePaths(snapshot)
      : flatFiles.map((entry) => normalizeFlatFilePath(entry))

    return sortUniquePaths(indexedPaths
      .filter((filePath) => isWorkspaceProjectTextPath(filePath, workspacePath)))
  }

  async function listWorkspaceProjectTextPaths({
    workspacePath = '',
    editorStore,
    filesStore,
  } = {}) {
    const loadedPaths = listLoadedWorkspaceTextPaths({
      workspacePath,
      editorStore,
      filesStore,
    })

    const currentSnapshot = filesStore?.lastWorkspaceSnapshot || null
    const currentFlatFiles = currentSnapshot
      ? listWorkspaceFlatFilePaths(currentSnapshot)
      : Array.isArray(filesStore?.flatFiles) ? filesStore.flatFiles : []
    let ensuredFlatFiles = currentFlatFiles
    let ensuredSnapshot = currentSnapshot
    try {
      const snapshot = await filesStore?.readWorkspaceSnapshot?.()
      const nextFlatFiles = snapshot?.flatFiles
      if (Array.isArray(nextFlatFiles)) {
        ensuredSnapshot = snapshot
        ensuredFlatFiles = nextFlatFiles
      } else {
        const fallbackFlatFiles = await filesStore?.ensureFlatFilesReady?.()
        if (Array.isArray(fallbackFlatFiles)) {
          ensuredFlatFiles = fallbackFlatFiles
        }
      }
    } catch {
      try {
        const nextFlatFiles = await filesStore?.ensureFlatFilesReady?.()
        if (Array.isArray(nextFlatFiles)) {
          ensuredFlatFiles = nextFlatFiles
        }
      } catch {
        // Fall back to the current index cache if recursive listing is unavailable.
      }
    }

    const indexedPaths = listIndexedWorkspaceProjectTextPaths({
      workspacePath,
      snapshot: ensuredSnapshot,
      flatFiles: ensuredFlatFiles,
    })

    return sortUniquePaths([...loadedPaths, ...indexedPaths])
  }

  return {
    isWorkspaceProjectTextPath,
    listLoadedWorkspaceTextPaths,
    listIndexedWorkspaceProjectTextPaths,
    listWorkspaceProjectTextPaths,
  }
}
