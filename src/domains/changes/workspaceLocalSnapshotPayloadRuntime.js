import { invoke } from '@tauri-apps/api/core'

import { TEXT_FILE_READ_LIMIT_BYTES } from '../files/workspaceTextFileLimits.js'
import { createWorkspaceSnapshotProjectTextRuntime } from './workspaceSnapshotProjectTextRuntime.js'

const WORKSPACE_SNAPSHOT_PAYLOAD_VERSION = 1
const WORKSPACE_SNAPSHOT_PAYLOAD_KIND = 'workspace-text-v1'
const WORKSPACE_SNAPSHOT_PAYLOAD_CAPTURE_SCOPE_OPEN_FILES = 'open-workspace-files'
const WORKSPACE_SNAPSHOT_PAYLOAD_CAPTURE_SCOPE_LOADED_TEXT = 'loaded-workspace-text'
const WORKSPACE_SNAPSHOT_PAYLOAD_CAPTURE_SCOPE_PROJECT_TEXT_SET = 'project-text-set'
const WORKSPACE_SNAPSHOT_SKIPPED_REASON_READ_FAILED = 'read-failed'
const WORKSPACE_SNAPSHOT_SKIPPED_REASON_TOO_LARGE = 'too-large'
const WORKSPACE_SNAPSHOT_PAYLOADS_DIR = 'snapshots/payloads'
const WORKSPACE_SNAPSHOT_PAYLOAD_FILES_DIR = 'files'
const WORKSPACE_SNAPSHOT_PAYLOAD_MANIFEST_FILE = 'manifest.json'

function normalizeSnapshotValue(value = '') {
  return String(value || '').trim()
}

function normalizeSnapshotDate(value = '') {
  const normalized = normalizeSnapshotValue(value)
  if (!normalized) {
    return ''
  }

  const timestamp = Date.parse(normalized)
  return Number.isNaN(timestamp) ? normalized : new Date(timestamp).toISOString()
}

function normalizePathValue(value = '') {
  return normalizeSnapshotValue(value).replace(/\\/g, '/').replace(/\/+$/, '')
}

function normalizeNonNegativeInteger(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
}

function normalizePayloadCaptureScope(value = '') {
  const normalized = normalizeSnapshotValue(value)
  if (
    normalized === WORKSPACE_SNAPSHOT_PAYLOAD_CAPTURE_SCOPE_OPEN_FILES
    || normalized === WORKSPACE_SNAPSHOT_PAYLOAD_CAPTURE_SCOPE_LOADED_TEXT
    || normalized === WORKSPACE_SNAPSHOT_PAYLOAD_CAPTURE_SCOPE_PROJECT_TEXT_SET
  ) {
    return normalized
  }

  return ''
}

function normalizeSkippedReason(value = '') {
  const normalized = normalizeSnapshotValue(value)
  if (normalized === WORKSPACE_SNAPSHOT_SKIPPED_REASON_TOO_LARGE) {
    return normalized
  }

  return WORKSPACE_SNAPSHOT_SKIPPED_REASON_READ_FAILED
}

function sanitizePayloadKey(value = '') {
  const normalized = normalizeSnapshotValue(value).replace(/[^a-zA-Z0-9._-]+/g, '_')
  return normalized.replace(/^_+|_+$/g, '') || 'workspace-snapshot'
}

function buildWorkspaceSnapshotPayloadKey(snapshot = null) {
  const sourceId = normalizeSnapshotValue(snapshot?.sourceId)
  if (sourceId) {
    return sanitizePayloadKey(sourceId)
  }

  return sanitizePayloadKey(`${normalizeSnapshotDate(snapshot?.createdAt)}-${normalizeSnapshotValue(snapshot?.message)}`)
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

export function resolveWorkspaceSnapshotPayloadsDir(workspaceDataDir = '') {
  const normalized = normalizeSnapshotValue(workspaceDataDir)
  return normalized ? `${normalized}/${WORKSPACE_SNAPSHOT_PAYLOADS_DIR}` : ''
}

export function resolveWorkspaceSnapshotPayloadDir(workspaceDataDir = '', snapshot = null) {
  const payloadsDir = resolveWorkspaceSnapshotPayloadsDir(workspaceDataDir)
  if (!payloadsDir) {
    return ''
  }
  return `${payloadsDir}/${buildWorkspaceSnapshotPayloadKey(snapshot)}`
}

export function resolveWorkspaceSnapshotPayloadManifestPath(workspaceDataDir = '', snapshot = null) {
  const payloadDir = resolveWorkspaceSnapshotPayloadDir(workspaceDataDir, snapshot)
  return payloadDir ? `${payloadDir}/${WORKSPACE_SNAPSHOT_PAYLOAD_MANIFEST_FILE}` : ''
}

export function createWorkspaceSnapshotPayloadMeta(payload = null) {
  const manifestPath = normalizeSnapshotValue(payload?.manifestPath)
  const fileCount = normalizeNonNegativeInteger(payload?.fileCount)
  const skippedCount = normalizeNonNegativeInteger(payload?.skippedCount)
  if (!manifestPath) {
    return null
  }

  return {
    version: WORKSPACE_SNAPSHOT_PAYLOAD_VERSION,
    kind: WORKSPACE_SNAPSHOT_PAYLOAD_KIND,
    manifestPath,
    fileCount,
    skippedCount,
    capturedAt: normalizeSnapshotDate(payload?.capturedAt) || new Date().toISOString(),
    captureScope: normalizePayloadCaptureScope(payload?.captureScope) || WORKSPACE_SNAPSHOT_PAYLOAD_CAPTURE_SCOPE_OPEN_FILES,
  }
}

export function createWorkspaceSnapshotPayloadManifest({
  workspacePath = '',
  snapshot = null,
  files = [],
  skippedFiles = [],
  payload = null,
} = {}) {
  const normalizedWorkspacePath = normalizePathValue(workspacePath)
  const normalizedPayload = createWorkspaceSnapshotPayloadMeta(payload)
  if (
    !normalizedWorkspacePath
    || !normalizedPayload
    || !Array.isArray(files)
    || !Array.isArray(skippedFiles)
  ) {
    return null
  }

  return {
    version: WORKSPACE_SNAPSHOT_PAYLOAD_VERSION,
    kind: WORKSPACE_SNAPSHOT_PAYLOAD_KIND,
    workspacePath: normalizedWorkspacePath,
    snapshot: {
      sourceId: normalizeSnapshotValue(snapshot?.sourceId),
      createdAt: normalizeSnapshotDate(snapshot?.createdAt) || normalizedPayload.capturedAt,
      message: normalizeSnapshotValue(snapshot?.message),
    },
    capturedAt: normalizedPayload.capturedAt,
    fileCount: normalizedPayload.fileCount,
    skippedCount: normalizedPayload.skippedCount,
    captureScope: normalizedPayload.captureScope,
    files: files.map((file) => ({
      path: normalizeSnapshotValue(file?.path),
      relativePath: normalizeSnapshotValue(file?.relativePath),
      contentPath: normalizeSnapshotValue(file?.contentPath),
    })),
    skippedFiles: skippedFiles.map((file) => ({
      path: normalizeSnapshotValue(file?.path),
      relativePath: normalizeSnapshotValue(file?.relativePath),
      reason: normalizeSkippedReason(file?.reason),
    })),
  }
}

export function getWorkspaceSnapshotPayloadCaptureScope(payload = null) {
  return createWorkspaceSnapshotPayloadMeta(payload)?.captureScope || ''
}

export function getWorkspaceSnapshotPayloadSkippedCount(payload = null) {
  return createWorkspaceSnapshotPayloadMeta(payload)?.skippedCount || 0
}

export function isLoadedWorkspaceTextPayload(payload = null) {
  return getWorkspaceSnapshotPayloadCaptureScope(payload) === WORKSPACE_SNAPSHOT_PAYLOAD_CAPTURE_SCOPE_LOADED_TEXT
}

export function isProjectTextSetPayload(payload = null) {
  return getWorkspaceSnapshotPayloadCaptureScope(payload) === WORKSPACE_SNAPSHOT_PAYLOAD_CAPTURE_SCOPE_PROJECT_TEXT_SET
}

export function createWorkspaceLocalSnapshotPayloadRuntime({
  projectTextRuntime = createWorkspaceSnapshotProjectTextRuntime(),
  readFileImpl = async (path, maxBytes = TEXT_FILE_READ_LIMIT_BYTES) => invoke('read_file', { path, maxBytes }),
  writeFileImpl = async (path, content) => invoke('write_file', { path, content }),
  createDirImpl = async (path) => invoke('create_dir', { path }),
  applyFileContentImpl = async (path, content) => invoke('write_file', { path, content }),
} = {}) {
  async function captureWorkspaceSnapshotPayload({
    workspacePath = '',
    workspaceDataDir = '',
    snapshot = null,
    editorStore,
    filesStore,
  } = {}) {
    const manifestPath = resolveWorkspaceSnapshotPayloadManifestPath(workspaceDataDir, snapshot)
    const payloadDir = resolveWorkspaceSnapshotPayloadDir(workspaceDataDir, snapshot)
    if (!workspacePath || !workspaceDataDir || !manifestPath || !payloadDir) {
      return null
    }

    const candidatePaths = await projectTextRuntime.listWorkspaceProjectTextPaths({
      workspacePath,
      editorStore,
      filesStore,
    })

    const payloadFiles = []
    const skippedFiles = []
    const payloadFilesDir = `${payloadDir}/${WORKSPACE_SNAPSHOT_PAYLOAD_FILES_DIR}`
    await createDirImpl(payloadDir).catch(() => {})
    await createDirImpl(payloadFilesDir).catch(() => {})

    for (const filePath of candidatePaths) {
      let content = ''
      try {
        content = await readFileImpl(filePath, TEXT_FILE_READ_LIMIT_BYTES)
      } catch (error) {
        const fallback = filesStore?.fileContents?.[filePath]
        if (typeof fallback !== 'string') {
          skippedFiles.push({
            path: filePath,
            relativePath: resolveWorkspaceRelativePath(filePath, workspacePath),
            reason: normalizeSnapshotValue(error?.message || error).startsWith('FILE_TOO_LARGE:')
              ? WORKSPACE_SNAPSHOT_SKIPPED_REASON_TOO_LARGE
              : WORKSPACE_SNAPSHOT_SKIPPED_REASON_READ_FAILED,
          })
          continue
        }
        content = fallback
      }

      const contentPath = `${WORKSPACE_SNAPSHOT_PAYLOAD_FILES_DIR}/${payloadFiles.length}.txt`
      await writeFileImpl(`${payloadDir}/${contentPath}`, content)
      payloadFiles.push({
        path: filePath,
        relativePath: resolveWorkspaceRelativePath(filePath, workspacePath),
        contentPath,
      })
    }

    const payload = createWorkspaceSnapshotPayloadMeta({
      manifestPath,
      fileCount: payloadFiles.length,
      skippedCount: skippedFiles.length,
      capturedAt: new Date().toISOString(),
      captureScope: WORKSPACE_SNAPSHOT_PAYLOAD_CAPTURE_SCOPE_PROJECT_TEXT_SET,
    })
    const manifest = createWorkspaceSnapshotPayloadManifest({
      workspacePath,
      snapshot,
      files: payloadFiles,
      skippedFiles,
      payload,
    })
    await writeFileImpl(manifestPath, JSON.stringify(manifest, null, 2))
    return payload
  }

  async function loadWorkspaceSnapshotPayloadManifest({
    workspaceDataDir = '',
    snapshot = null,
  } = {}) {
    const manifestPath = normalizeSnapshotValue(snapshot?.payload?.manifestPath)
      || resolveWorkspaceSnapshotPayloadManifestPath(workspaceDataDir, snapshot)
    if (!manifestPath) {
      return null
    }

    try {
      return JSON.parse(await readFileImpl(manifestPath))
    } catch {
      return null
    }
  }

  async function restoreWorkspaceSnapshotPayload({
    workspacePath = '',
    workspaceDataDir = '',
    snapshot = null,
    applyFileContent = applyFileContentImpl,
    targetPaths = [],
  } = {}) {
    if (!workspacePath || !workspaceDataDir || !snapshot) {
      return { restored: false, reason: 'missing-input' }
    }

    const manifest = await loadWorkspaceSnapshotPayloadManifest({
      workspaceDataDir,
      snapshot,
    })
    if (!manifest) {
      return { restored: false, reason: 'missing-payload' }
    }

    const normalizedWorkspacePath = normalizePathValue(workspacePath)
    const manifestWorkspacePath = normalizePathValue(manifest.workspacePath)
    if (!manifestWorkspacePath || manifestWorkspacePath !== normalizedWorkspacePath) {
      return { restored: false, reason: 'workspace-mismatch', manifest }
    }

    const payloadDir = resolveWorkspaceSnapshotPayloadDir(workspaceDataDir, snapshot)
    const requestedTargetPathSet = new Set(
      (Array.isArray(targetPaths) ? targetPaths : [])
        .map((path) => normalizePathValue(path))
        .filter(Boolean),
    )
    const filesToRestore = (manifest.files || []).filter((file) => {
      if (requestedTargetPathSet.size === 0) {
        return true
      }
      return requestedTargetPathSet.has(normalizePathValue(file?.path))
    })
    if (requestedTargetPathSet.size > 0 && filesToRestore.length === 0) {
      return {
        restored: false,
        reason: 'missing-targets',
        restoredFiles: [],
        manifest,
      }
    }

    const restoredFiles = []
    for (const file of filesToRestore) {
      const targetPath = normalizeSnapshotValue(file?.path)
      const contentPath = normalizeSnapshotValue(file?.contentPath)
      if (!targetPath || !contentPath) {
        continue
      }

      const content = await readFileImpl(`${payloadDir}/${contentPath}`)
      const applied = await applyFileContent(targetPath, content)
      if (applied === false) {
        return {
          restored: false,
          reason: 'apply-failed',
          filePath: targetPath,
          restoredFiles,
          manifest,
        }
      }
      restoredFiles.push(targetPath)
    }

    return {
      restored: restoredFiles.length > 0,
      restoredFiles,
      manifest,
    }
  }

  return {
    captureWorkspaceSnapshotPayload,
    loadWorkspaceSnapshotPayloadManifest,
    restoreWorkspaceSnapshotPayload,
  }
}
