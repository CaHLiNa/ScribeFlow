import { isBinaryFile } from '../../utils/fileTypes.js'
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
    flatFiles = [],
  } = {}) {
    return sortUniquePaths(flatFiles
      .map((entry) => normalizeFlatFilePath(entry))
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

    const currentFlatFiles = Array.isArray(filesStore?.flatFiles) ? filesStore.flatFiles : []
    let ensuredFlatFiles = currentFlatFiles
    try {
      const nextFlatFiles = await filesStore?.ensureFlatFilesReady?.()
      if (Array.isArray(nextFlatFiles)) {
        ensuredFlatFiles = nextFlatFiles
      }
    } catch {
      // Fall back to the current index cache if recursive listing is unavailable.
    }

    const indexedPaths = listIndexedWorkspaceProjectTextPaths({
      workspacePath,
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
