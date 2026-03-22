import { invoke } from '@tauri-apps/api/core'

import { TEXT_FILE_READ_LIMIT_BYTES } from '../files/workspaceTextFileLimits.js'
import { pathExists } from '../../services/pathExists.js'
import { createWorkspaceSnapshotDeletionRuntime } from './workspaceSnapshotDeletionRuntime.js'
import {
  createWorkspaceLocalSnapshotPayloadRuntime,
  resolveWorkspaceSnapshotPayloadDir,
} from './workspaceLocalSnapshotPayloadRuntime.js'

function normalizeValue(value = '') {
  return String(value || '').trim()
}

function normalizePathValue(value = '') {
  return normalizeValue(value).replace(/\\/g, '/').replace(/\/+$/, '')
}

function classifyPreviewEntryStatus(error) {
  const message = normalizeValue(error?.message || error)
  if (message.startsWith('FILE_TOO_LARGE:')) {
    return 'too-large'
  }
  return 'unreadable'
}

function createEmptyCounts() {
  return {
    unchanged: 0,
    modified: 0,
    missing: 0,
    unreadable: 0,
    tooLarge: 0,
    added: 0,
  }
}

export function createWorkspaceSnapshotPreviewRuntime({
  payloadRuntime = createWorkspaceLocalSnapshotPayloadRuntime(),
  deletionRuntime = createWorkspaceSnapshotDeletionRuntime({
    payloadRuntime,
  }),
  readFileImpl = async (path, maxBytes = TEXT_FILE_READ_LIMIT_BYTES) => invoke('read_file', { path, maxBytes }),
  pathExistsImpl = pathExists,
} = {}) {
  async function loadWorkspaceSnapshotPreviewSummary({
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
        counts: createEmptyCounts(),
        entries: [],
        skippedFiles: Array.isArray(manifest.skippedFiles) ? manifest.skippedFiles : [],
        reason: 'workspace-mismatch',
      }
    }

    const payloadDir = resolveWorkspaceSnapshotPayloadDir(workspaceDataDir, snapshot)
    const entries = []
    const counts = createEmptyCounts()

    for (const file of manifest.files || []) {
      const targetPath = normalizeValue(file?.path)
      const relativePath = normalizeValue(file?.relativePath)
      const contentPath = normalizeValue(file?.contentPath)
      if (!targetPath || !contentPath) {
        continue
      }

      const payloadContent = await readFileImpl(`${payloadDir}/${contentPath}`)
      const exists = await pathExistsImpl(targetPath)
      if (!exists) {
        counts.missing += 1
        entries.push({
          path: targetPath,
          relativePath,
          status: 'missing',
        })
        continue
      }

      try {
        const currentContent = await readFileImpl(targetPath, TEXT_FILE_READ_LIMIT_BYTES)
        const status = currentContent === payloadContent ? 'unchanged' : 'modified'
        counts[status] += 1
        entries.push({
          path: targetPath,
          relativePath,
          status,
        })
      } catch (error) {
        const status = classifyPreviewEntryStatus(error)
        if (status === 'too-large') {
          counts.tooLarge += 1
        } else {
          counts.unreadable += 1
        }
        entries.push({
          path: targetPath,
          relativePath,
          status,
        })
      }
    }

    const addedFiles = await deletionRuntime.listWorkspaceSnapshotAddedFiles({
      workspacePath,
      workspaceDataDir,
      snapshot,
      filesStore,
      editorStore,
    })
    const addedEntries = Array.isArray(addedFiles?.entries) ? addedFiles.entries : []
    counts.added = addedEntries.length

    return {
      manifest,
      counts,
      entries,
      addedEntries,
      skippedFiles: Array.isArray(manifest.skippedFiles) ? manifest.skippedFiles : [],
      reason: '',
    }
  }

  return {
    loadWorkspaceSnapshotPreviewSummary,
  }
}
