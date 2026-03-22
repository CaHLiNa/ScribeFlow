import { createWorkspaceLocalSnapshotPayloadRuntime } from './workspaceLocalSnapshotPayloadRuntime.js'
import { createWorkspaceSnapshotProjectTextRuntime } from './workspaceSnapshotProjectTextRuntime.js'

function normalizeValue(value = '') {
  return String(value || '').trim()
}

function normalizePathValue(value = '') {
  return normalizeValue(value).replace(/\\/g, '/').replace(/\/+$/, '')
}

function resolveWorkspaceRelativePath(filePath = '', workspacePath = '') {
  const normalizedFilePath = normalizePathValue(filePath)
  const normalizedWorkspacePath = normalizePathValue(workspacePath)
  if (!normalizedFilePath || !normalizedWorkspacePath) {
    return ''
  }
  if (normalizedFilePath === normalizedWorkspacePath) {
    return '.'
  }
  if (!normalizedFilePath.startsWith(`${normalizedWorkspacePath}/`)) {
    return normalizedFilePath
  }
  return normalizedFilePath.slice(normalizedWorkspacePath.length + 1)
}

function createTrackedSnapshotPathSet(manifest = null) {
  const trackedPaths = new Set()

  for (const file of manifest?.files || []) {
    const normalizedPath = normalizePathValue(file?.path)
    if (normalizedPath) {
      trackedPaths.add(normalizedPath)
    }
  }

  for (const file of manifest?.skippedFiles || []) {
    const normalizedPath = normalizePathValue(file?.path)
    if (normalizedPath) {
      trackedPaths.add(normalizedPath)
    }
  }

  return trackedPaths
}

export function createWorkspaceSnapshotDeletionRuntime({
  payloadRuntime = createWorkspaceLocalSnapshotPayloadRuntime(),
  projectTextRuntime = createWorkspaceSnapshotProjectTextRuntime(),
} = {}) {
  async function listWorkspaceSnapshotAddedFiles({
    workspacePath = '',
    workspaceDataDir = '',
    snapshot = null,
    filesStore,
    editorStore,
  } = {}) {
    if (!workspacePath || !workspaceDataDir || !snapshot) {
      return null
    }

    const manifest = await payloadRuntime.loadWorkspaceSnapshotPayloadManifest({
      workspaceDataDir,
      snapshot,
    })
    if (!manifest) {
      return null
    }

    const normalizedWorkspacePath = normalizePathValue(workspacePath)
    const manifestWorkspacePath = normalizePathValue(manifest.workspacePath)
    if (!manifestWorkspacePath || manifestWorkspacePath !== normalizedWorkspacePath) {
      return {
        manifest,
        entries: [],
        reason: 'workspace-mismatch',
      }
    }

    const trackedPaths = createTrackedSnapshotPathSet(manifest)
    const currentProjectTextPaths = await projectTextRuntime.listWorkspaceProjectTextPaths({
      workspacePath,
      filesStore,
      editorStore,
    })

    const entries = currentProjectTextPaths
      .map((filePath) => normalizePathValue(filePath))
      .filter((filePath) => filePath && !trackedPaths.has(filePath))
      .map((filePath) => ({
        path: filePath,
        relativePath: resolveWorkspaceRelativePath(filePath, workspacePath),
        status: 'added',
      }))

    return {
      manifest,
      entries,
      reason: '',
    }
  }

  async function removeWorkspaceSnapshotAddedFiles({
    workspacePath = '',
    workspaceDataDir = '',
    snapshot = null,
    filesStore,
    editorStore,
    targetPaths = [],
    deletePath = async (filePath) => filesStore?.deletePath?.(filePath),
  } = {}) {
    const addedFiles = await listWorkspaceSnapshotAddedFiles({
      workspacePath,
      workspaceDataDir,
      snapshot,
      filesStore,
      editorStore,
    })
    if (!addedFiles?.manifest) {
      return {
        removed: false,
        reason: 'missing-payload',
        removedFiles: [],
      }
    }

    if (addedFiles.reason) {
      return {
        removed: false,
        reason: addedFiles.reason,
        removedFiles: [],
        manifest: addedFiles.manifest,
        candidates: addedFiles.entries,
      }
    }

    const requestedTargetPathSet = new Set(
      (Array.isArray(targetPaths) ? targetPaths : [])
        .map((path) => normalizePathValue(path))
        .filter(Boolean),
    )
    const filesToRemove = addedFiles.entries.filter((entry) => {
      if (requestedTargetPathSet.size === 0) {
        return true
      }
      return requestedTargetPathSet.has(normalizePathValue(entry?.path))
    })

    if (requestedTargetPathSet.size > 0 && filesToRemove.length === 0) {
      return {
        removed: false,
        reason: 'missing-targets',
        removedFiles: [],
        manifest: addedFiles.manifest,
        candidates: addedFiles.entries,
      }
    }

    const removedFiles = []
    for (const file of filesToRemove) {
      const filePath = normalizePathValue(file?.path)
      if (!filePath) {
        continue
      }

      const removed = await deletePath(filePath)
      if (!removed) {
        return {
          removed: false,
          reason: 'delete-failed',
          filePath,
          removedFiles,
          manifest: addedFiles.manifest,
          candidates: addedFiles.entries,
        }
      }
      removedFiles.push(filePath)
    }

    return {
      removed: removedFiles.length > 0,
      removedFiles,
      manifest: addedFiles.manifest,
      candidates: addedFiles.entries,
    }
  }

  return {
    listWorkspaceSnapshotAddedFiles,
    removeWorkspaceSnapshotAddedFiles,
  }
}
