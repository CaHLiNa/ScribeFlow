import { invoke } from '@tauri-apps/api/core'

import { TEXT_FILE_READ_LIMIT_BYTES } from '../files/workspaceTextFileLimits.js'
import { pathExists } from '../../services/pathExists.js'
import {
  createWorkspaceLocalSnapshotPayloadRuntime,
  resolveWorkspaceSnapshotPayloadDir,
} from './workspaceLocalSnapshotPayloadRuntime.js'

const WORKSPACE_SNAPSHOT_PREVIEW_CONTEXT_LINES = 2
const WORKSPACE_SNAPSHOT_PREVIEW_MAX_LINES = 16

function normalizeValue(value = '') {
  return String(value || '').trim()
}

function normalizePathValue(value = '') {
  return normalizeValue(value).replace(/\\/g, '/').replace(/\/+$/, '')
}

function classifyPreviewStatus(error) {
  const message = normalizeValue(error?.message || error)
  if (message.startsWith('FILE_TOO_LARGE:')) {
    return 'too-large'
  }
  return 'unreadable'
}

function splitLines(content = '') {
  return String(content ?? '').split('\n')
}

function resolveFirstChangedLine(snapshotLines = [], currentLines = []) {
  const limit = Math.max(snapshotLines.length, currentLines.length)
  for (let index = 0; index < limit; index += 1) {
    if (snapshotLines[index] !== currentLines[index]) {
      return index
    }
  }
  return -1
}

function resolveLastChangedLines(snapshotLines = [], currentLines = [], firstChangedLine = -1) {
  if (firstChangedLine < 0) {
    return {
      snapshot: -1,
      current: -1,
    }
  }

  let snapshotIndex = snapshotLines.length - 1
  let currentIndex = currentLines.length - 1
  while (
    snapshotIndex >= firstChangedLine
    && currentIndex >= firstChangedLine
    && snapshotLines[snapshotIndex] === currentLines[currentIndex]
  ) {
    snapshotIndex -= 1
    currentIndex -= 1
  }

  return {
    snapshot: snapshotIndex,
    current: currentIndex,
  }
}

function createPreviewExcerpt(lines = [], startIndex = 0, endIndex = 0) {
  const safeStartIndex = Math.max(0, startIndex)
  const safeEndIndex = Math.max(safeStartIndex, Math.min(lines.length, endIndex))
  const excerptLines = lines.slice(safeStartIndex, safeEndIndex)
  return {
    startLine: safeStartIndex + 1,
    lineCount: excerptLines.length,
    totalLines: lines.length,
    truncatedBefore: safeStartIndex > 0,
    truncatedAfter: safeEndIndex < lines.length,
    lines: excerptLines,
  }
}

function buildPreviewWindow({
  snapshotLines = [],
  currentLines = [],
  firstChangedLine = -1,
  lastChangedSnapshotLine = -1,
  lastChangedCurrentLine = -1,
} = {}) {
  const totalLines = Math.max(snapshotLines.length, currentLines.length)
  if (totalLines === 0) {
    return { startIndex: 0, endIndex: 0 }
  }

  if (firstChangedLine < 0) {
    return {
      startIndex: 0,
      endIndex: Math.min(totalLines, WORKSPACE_SNAPSHOT_PREVIEW_MAX_LINES),
    }
  }

  const changedEndLine = Math.max(lastChangedSnapshotLine, lastChangedCurrentLine)
  let startIndex = Math.max(0, firstChangedLine - WORKSPACE_SNAPSHOT_PREVIEW_CONTEXT_LINES)
  let endIndex = Math.min(
    totalLines,
    changedEndLine + WORKSPACE_SNAPSHOT_PREVIEW_CONTEXT_LINES + 1,
  )

  if (endIndex - startIndex > WORKSPACE_SNAPSHOT_PREVIEW_MAX_LINES) {
    endIndex = startIndex + WORKSPACE_SNAPSHOT_PREVIEW_MAX_LINES
  } else if (endIndex === totalLines && endIndex - startIndex < WORKSPACE_SNAPSHOT_PREVIEW_MAX_LINES) {
    startIndex = Math.max(0, endIndex - WORKSPACE_SNAPSHOT_PREVIEW_MAX_LINES)
  }

  return {
    startIndex,
    endIndex,
  }
}

function buildDiffSummary({
  snapshotLines = [],
  currentLines = [],
  firstChangedLine = -1,
  lastChangedSnapshotLine = -1,
  lastChangedCurrentLine = -1,
} = {}) {
  const changedLineCount = firstChangedLine < 0
    ? 0
    : Math.max(lastChangedSnapshotLine, lastChangedCurrentLine) - firstChangedLine + 1

  return {
    firstChangedLine: firstChangedLine >= 0 ? firstChangedLine + 1 : 0,
    changedLineCount: Math.max(0, changedLineCount),
    snapshotLineCount: snapshotLines.length,
    currentLineCount: currentLines.length,
  }
}

export function createWorkspaceSnapshotDiffRuntime({
  payloadRuntime = createWorkspaceLocalSnapshotPayloadRuntime(),
  readFileImpl = async (path, maxBytes = TEXT_FILE_READ_LIMIT_BYTES) => invoke('read_file', { path, maxBytes }),
  pathExistsImpl = pathExists,
} = {}) {
  async function loadWorkspaceSnapshotFilePreview({
    workspacePath = '',
    workspaceDataDir = '',
    snapshot = null,
    filePath = '',
  } = {}) {
    if (!workspacePath || !workspaceDataDir || !snapshot || !filePath) {
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
        file: null,
        status: 'workspace-mismatch',
        snapshotContent: '',
        currentContent: '',
        summary: null,
        snapshotExcerpt: null,
        currentExcerpt: null,
      }
    }

    const normalizedFilePath = normalizePathValue(filePath)
    const file = (manifest.files || []).find((entry) => normalizePathValue(entry?.path) === normalizedFilePath)
    if (!file) {
      return {
        manifest,
        file: null,
        status: 'missing-entry',
        snapshotContent: '',
        currentContent: '',
        summary: null,
        snapshotExcerpt: null,
        currentExcerpt: null,
      }
    }

    const payloadDir = resolveWorkspaceSnapshotPayloadDir(workspaceDataDir, snapshot)
    const payloadContent = await readFileImpl(`${payloadDir}/${normalizeValue(file.contentPath)}`)
    const snapshotLines = splitLines(payloadContent)
    const fileEntry = {
      path: normalizeValue(file.path),
      relativePath: normalizeValue(file.relativePath),
    }

    const exists = await pathExistsImpl(fileEntry.path)
    if (!exists) {
      const snapshotExcerpt = createPreviewExcerpt(
        snapshotLines,
        0,
        Math.min(snapshotLines.length, WORKSPACE_SNAPSHOT_PREVIEW_MAX_LINES),
      )
      return {
        manifest,
        file: fileEntry,
        status: 'missing',
        snapshotContent: payloadContent,
        currentContent: '',
        summary: {
          firstChangedLine: snapshotExcerpt.lineCount > 0 ? 1 : 0,
          changedLineCount: snapshotLines.length,
          snapshotLineCount: snapshotLines.length,
          currentLineCount: 0,
        },
        snapshotExcerpt,
        currentExcerpt: null,
      }
    }

    try {
      const currentContent = await readFileImpl(fileEntry.path, TEXT_FILE_READ_LIMIT_BYTES)
      const currentLines = splitLines(currentContent)
      const firstChangedLine = resolveFirstChangedLine(snapshotLines, currentLines)
      const status = firstChangedLine < 0 ? 'unchanged' : 'modified'
      const {
        snapshot: lastChangedSnapshotLine,
        current: lastChangedCurrentLine,
      } = resolveLastChangedLines(snapshotLines, currentLines, firstChangedLine)
      const {
        startIndex,
        endIndex,
      } = buildPreviewWindow({
        snapshotLines,
        currentLines,
        firstChangedLine,
        lastChangedSnapshotLine,
        lastChangedCurrentLine,
      })
      return {
        manifest,
        file: fileEntry,
        status,
        snapshotContent: payloadContent,
        currentContent,
        summary: buildDiffSummary({
          snapshotLines,
          currentLines,
          firstChangedLine,
          lastChangedSnapshotLine,
          lastChangedCurrentLine,
        }),
        snapshotExcerpt: createPreviewExcerpt(snapshotLines, startIndex, endIndex),
        currentExcerpt: createPreviewExcerpt(currentLines, startIndex, endIndex),
      }
    } catch (error) {
      return {
        manifest,
        file: fileEntry,
        status: classifyPreviewStatus(error),
        snapshotContent: '',
        currentContent: '',
        summary: null,
        snapshotExcerpt: null,
        currentExcerpt: null,
      }
    }
  }

  return {
    loadWorkspaceSnapshotFilePreview,
  }
}
