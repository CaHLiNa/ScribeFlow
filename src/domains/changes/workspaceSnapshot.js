import { createWorkspaceHistoryAvailabilityRuntime } from './workspaceHistoryAvailabilityRuntime.js'
import { createWorkspaceHistoryPointRuntime } from './workspaceHistoryPointRuntime.js'
import {
  createWorkspaceLocalSnapshotPayloadRuntime,
  getWorkspaceSnapshotPayloadCaptureScope,
  getWorkspaceSnapshotPayloadSkippedCount,
  isLoadedWorkspaceTextPayload,
  isProjectTextSetPayload,
} from './workspaceLocalSnapshotPayloadRuntime.js'
import { createWorkspaceLocalSnapshotStoreRuntime } from './workspaceLocalSnapshotStoreRuntime.js'
import { createWorkspaceSnapshotDeletionRuntime } from './workspaceSnapshotDeletionRuntime.js'
import { createWorkspaceSnapshotDiffRuntime } from './workspaceSnapshotDiffRuntime.js'
import { createWorkspaceSnapshotFileApplyRuntime } from './workspaceSnapshotFileApplyRuntime.js'
import { createWorkspaceSnapshotPreviewRuntime } from './workspaceSnapshotPreviewRuntime.js'
import {
  attachWorkspaceSnapshotMetadata,
  attachWorkspaceSnapshotMetadataList,
  createWorkspaceSnapshotMetadata,
  getWorkspaceSnapshotMetadata,
  getWorkspaceSnapshotTitle,
} from './workspaceSnapshotMetadataRuntime.js'
import {
  createWorkspaceSnapshotRuntime,
  createWorkspaceSnapshotRecord,
  getWorkspaceSnapshotDisplayMessage,
  isNamedWorkspaceSnapshot,
} from './workspaceSnapshotRuntime.js'

export function createWorkspaceSnapshotOperations({
  availabilityRuntime = createWorkspaceHistoryAvailabilityRuntime(),
  historyPointRuntime = createWorkspaceHistoryPointRuntime({
    availabilityRuntime,
  }),
  snapshotRuntime = createWorkspaceSnapshotRuntime(),
  previewRuntime = createWorkspaceSnapshotPreviewRuntime(),
  deletionRuntime = createWorkspaceSnapshotDeletionRuntime(),
  diffRuntime = createWorkspaceSnapshotDiffRuntime(),
  fileApplyRuntime = createWorkspaceSnapshotFileApplyRuntime(),
  localSnapshotPayloadRuntime = createWorkspaceLocalSnapshotPayloadRuntime(),
  localSnapshotStoreRuntime = createWorkspaceLocalSnapshotStoreRuntime(),
  attachSnapshotMetadataImpl = attachWorkspaceSnapshotMetadata,
  attachSnapshotMetadataListImpl = attachWorkspaceSnapshotMetadataList,
  logErrorImpl = (...args) => console.error(...args),
} = {}) {
  async function createWorkspaceSnapshot({
    workspace,
    filesStore,
    editorStore,
    preferredSnapshotLabel = '',
    requestSnapshotLabel,
    showNoChanges,
    showCommitFailure,
    onUnavailable,
    onAutoCommitEnabled,
    t,
  } = {}) {
    if (!workspace?.path) {
      return null
    }

    try {
      const result = await historyPointRuntime.createHistoryPoint({
        workspace,
        filesStore,
        editorStore,
        preferredHistoryLabel: preferredSnapshotLabel,
        requestHistoryLabel: requestSnapshotLabel,
        showNoChanges,
        onUnavailable,
        onAutoCommitEnabled,
        t,
      })

      if (!result?.snapshot) {
        return result
      }

      const gitSnapshot = attachSnapshotMetadataImpl(result.snapshot)
      const payload = await localSnapshotPayloadRuntime.captureWorkspaceSnapshotPayload({
        workspacePath: workspace?.path || '',
        workspaceDataDir: workspace?.workspaceDataDir || '',
        snapshot: result.snapshot,
        editorStore,
        filesStore,
      }).catch((error) => {
        logErrorImpl('Capture snapshot payload error:', error)
        return null
      })
      const localSnapshotRecord = await localSnapshotStoreRuntime.recordWorkspaceSavePoint({
        workspaceDataDir: workspace?.workspaceDataDir || '',
        snapshot: {
          ...result.snapshot,
          payload,
        },
      })
      const localSnapshot = attachSnapshotMetadataImpl(localSnapshotRecord)
      const snapshot = localSnapshot || gitSnapshot
      return {
        ...result,
        gitSnapshot,
        localSnapshot,
        snapshot,
        snapshotMetadata: snapshot?.metadata ?? null,
      }
    } catch (error) {
      logErrorImpl('Create snapshot error:', error)
      showCommitFailure?.(error)
      return null
    }
  }

  async function openFileVersionHistoryBrowser({
    workspace,
    filePath = '',
    onUnavailable,
    onAutoCommitEnabled,
    onReady,
    options = {},
  } = {}) {
    const workspacePath = workspace?.path || ''
    if (!workspacePath || !filePath) {
      return null
    }

    const historyAvailability = await availabilityRuntime.ensureWorkspaceHistoryAvailable({
      workspacePath,
      options,
      onUnavailable,
      onAutoCommitEnabled,
    })
    if (!historyAvailability) {
      return null
    }

    onReady?.(filePath)
    return {
      historyAvailability,
      filePath,
    }
  }

  async function listFileVersionHistory({
    workspacePath = '',
    filePath = '',
    limit = 50,
    t,
  } = {}) {
    if (!workspacePath || !filePath) {
      return []
    }

    const snapshots = await snapshotRuntime.listFileVersionHistoryEntries({
      workspacePath,
      filePath,
      limit,
      t,
    })
    return attachSnapshotMetadataListImpl(snapshots)
  }

  async function listWorkspaceSavePoints({
    workspacePath = '',
    workspaceDataDir = '',
    limit = 50,
    t,
  } = {}) {
    if (!workspacePath) {
      return []
    }

    const snapshots = await snapshotRuntime.listWorkspaceSavePointEntries({
      workspacePath,
      workspaceDataDir,
      limit,
      t,
    })
    return attachSnapshotMetadataListImpl(snapshots)
  }

  async function loadFileVersionHistoryPreview(input = {}) {
    return snapshotRuntime.loadFileVersionHistoryPreview(input)
  }

  async function restoreFileVersionHistoryEntry(input = {}) {
    return snapshotRuntime.restoreFileVersionHistoryEntry(input)
  }

  async function loadWorkspaceSavePointPayloadManifest({
    workspace,
    snapshot = null,
  } = {}) {
    if (!workspace?.workspaceDataDir || !snapshot) {
      return null
    }

    return localSnapshotPayloadRuntime.loadWorkspaceSnapshotPayloadManifest({
      workspaceDataDir: workspace.workspaceDataDir,
      snapshot,
    })
  }

  async function loadWorkspaceSavePointPreviewSummary({
    workspace,
    snapshot = null,
    filesStore,
    editorStore,
  } = {}) {
    if (!workspace?.path || !workspace?.workspaceDataDir || !snapshot) {
      return null
    }

    return previewRuntime.loadWorkspaceSnapshotPreviewSummary({
      workspacePath: workspace.path,
      workspaceDataDir: workspace.workspaceDataDir,
      snapshot,
      filesStore,
      editorStore,
    })
  }

  async function loadWorkspaceSavePointFilePreview({
    workspace,
    snapshot = null,
    filePath = '',
  } = {}) {
    if (!workspace?.path || !workspace?.workspaceDataDir || !snapshot || !filePath) {
      return null
    }

    return diffRuntime.loadWorkspaceSnapshotFilePreview({
      workspacePath: workspace.path,
      workspaceDataDir: workspace.workspaceDataDir,
      snapshot,
      filePath,
    })
  }

  async function restoreWorkspaceSavePoint({
    workspace,
    filesStore,
    editorStore,
    snapshot = null,
    targetPaths = [],
    removeAddedFiles = false,
  } = {}) {
    if (!workspace?.path || !workspace?.workspaceDataDir || !snapshot) {
      return { restored: false, reason: 'missing-input' }
    }

    const payloadResult = await localSnapshotPayloadRuntime.restoreWorkspaceSnapshotPayload({
      workspacePath: workspace.path,
      workspaceDataDir: workspace.workspaceDataDir,
      snapshot,
      targetPaths,
      applyFileContent: async (filePath, content) =>
        fileApplyRuntime.applyWorkspaceSnapshotFileContent({
          filesStore,
          editorStore,
          filePath,
          content,
        }),
    })
    if (payloadResult?.reason && payloadResult.reason !== '' && payloadResult.reason !== 'missing-targets') {
      return payloadResult
    }

    let deleteResult = {
      removed: false,
      removedFiles: [],
    }
    if (removeAddedFiles && (!Array.isArray(targetPaths) || targetPaths.length === 0)) {
      deleteResult = await deletionRuntime.removeWorkspaceSnapshotAddedFiles({
        workspacePath: workspace.path,
        workspaceDataDir: workspace.workspaceDataDir,
        snapshot,
        filesStore,
        editorStore,
      })
      if (deleteResult?.reason && deleteResult.reason !== '' && deleteResult.reason !== 'missing-targets') {
        return {
          restored: false,
          reason: deleteResult.reason,
          restoredFiles: payloadResult?.restoredFiles || [],
          removedFiles: deleteResult?.removedFiles || [],
          filePath: deleteResult?.filePath || '',
          manifest: deleteResult?.manifest || payloadResult?.manifest,
        }
      }
    }

    return {
      restored: !!(payloadResult?.restored || deleteResult?.removed),
      restoredFiles: payloadResult?.restoredFiles || [],
      removedFiles: deleteResult?.removedFiles || [],
      manifest: payloadResult?.manifest || deleteResult?.manifest,
    }
  }

  async function restoreWorkspaceSavePointFile({
    workspace,
    filesStore,
    editorStore,
    snapshot = null,
    filePath = '',
  } = {}) {
    if (!filePath) {
      return { restored: false, reason: 'missing-input' }
    }

    return restoreWorkspaceSavePoint({
      workspace,
      filesStore,
      editorStore,
      snapshot,
      targetPaths: [filePath],
    })
  }

  async function applyWorkspaceSavePointFilePreviewContent({
    workspace,
    filesStore,
    editorStore,
    snapshot = null,
    filePath = '',
    content = '',
  } = {}) {
    if (!workspace?.path || !snapshot || !filePath || typeof content !== 'string') {
      return { applied: false, reason: 'missing-input' }
    }

    const applied = await fileApplyRuntime.applyWorkspaceSnapshotFileContent({
      filesStore,
      editorStore,
      filePath,
      content,
    })
    return {
      applied,
      reason: applied ? '' : 'apply-failed',
      filePath,
    }
  }

  async function removeWorkspaceSavePointAddedFile({
    workspace,
    filesStore,
    editorStore,
    snapshot = null,
    filePath = '',
  } = {}) {
    if (!workspace?.path || !workspace?.workspaceDataDir || !snapshot || !filePath) {
      return { removed: false, reason: 'missing-input' }
    }

    return deletionRuntime.removeWorkspaceSnapshotAddedFiles({
      workspacePath: workspace.path,
      workspaceDataDir: workspace.workspaceDataDir,
      snapshot,
      filesStore,
      editorStore,
      targetPaths: [filePath],
    })
  }

  return {
    createWorkspaceSnapshot,
    openFileVersionHistoryBrowser,
    listFileVersionHistory,
    listWorkspaceSavePoints,
    loadFileVersionHistoryPreview,
    restoreFileVersionHistoryEntry,
    loadWorkspaceSavePointPayloadManifest,
    loadWorkspaceSavePointPreviewSummary,
    loadWorkspaceSavePointFilePreview,
    restoreWorkspaceSavePoint,
    restoreWorkspaceSavePointFile,
    applyWorkspaceSavePointFilePreviewContent,
    removeWorkspaceSavePointAddedFile,
  }
}

const workspaceSnapshotOperations = createWorkspaceSnapshotOperations()

export const createWorkspaceSnapshot = workspaceSnapshotOperations.createWorkspaceSnapshot
export const openFileVersionHistoryBrowser = workspaceSnapshotOperations.openFileVersionHistoryBrowser
export const listFileVersionHistory = workspaceSnapshotOperations.listFileVersionHistory
export const listWorkspaceSavePoints = workspaceSnapshotOperations.listWorkspaceSavePoints
export const loadFileVersionHistoryPreview = workspaceSnapshotOperations.loadFileVersionHistoryPreview
export const restoreFileVersionHistoryEntry = workspaceSnapshotOperations.restoreFileVersionHistoryEntry
export const loadWorkspaceSavePointPayloadManifest = workspaceSnapshotOperations.loadWorkspaceSavePointPayloadManifest
export const loadWorkspaceSavePointPreviewSummary = workspaceSnapshotOperations.loadWorkspaceSavePointPreviewSummary
export const loadWorkspaceSavePointFilePreview = workspaceSnapshotOperations.loadWorkspaceSavePointFilePreview
export const restoreWorkspaceSavePoint = workspaceSnapshotOperations.restoreWorkspaceSavePoint
export const restoreWorkspaceSavePointFile = workspaceSnapshotOperations.restoreWorkspaceSavePointFile
export const applyWorkspaceSavePointFilePreviewContent = workspaceSnapshotOperations.applyWorkspaceSavePointFilePreviewContent
export const removeWorkspaceSavePointAddedFile = workspaceSnapshotOperations.removeWorkspaceSavePointAddedFile

export {
  attachWorkspaceSnapshotMetadata,
  attachWorkspaceSnapshotMetadataList,
  createWorkspaceSnapshotMetadata,
  getWorkspaceSnapshotMetadata,
  createWorkspaceSnapshotRecord,
  getWorkspaceSnapshotDisplayMessage,
  getWorkspaceSnapshotTitle,
  getWorkspaceSnapshotPayloadCaptureScope,
  getWorkspaceSnapshotPayloadSkippedCount,
  isLoadedWorkspaceTextPayload,
  isProjectTextSetPayload,
  isNamedWorkspaceSnapshot,
}
