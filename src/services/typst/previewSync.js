import { invoke } from '@tauri-apps/api/core'
import {
  requestTinymistExecuteCommand,
  subscribeTinymistNotification,
} from '../tinymist/session.js'
import { normalizeFsPath } from '../documentIntelligence/workspaceGraph.js'
import { resolveCachedTypstRootPath } from './root.js'

const TYPST_PREVIEW_TASK_ID = 'altals-typst-preview-sync'
const DEFAULT_TIMEOUT_MS = 2500

const previewTaskState = {
  taskId: null,
  rootPath: null,
  workspacePath: null,
  dataPlanePort: null,
  startToken: 0,
}

let pendingForwardSync = null

function toNotificationJumpLocation(payload = {}) {
  const filePath = String(payload?.filepath || '')
  if (!filePath) return null

  const start = Array.isArray(payload?.start)
    ? { line: Number(payload.start[0] || 0), character: Number(payload.start[1] || 0) }
    : null
  const end = Array.isArray(payload?.end)
    ? { line: Number(payload.end[0] || 0), character: Number(payload.end[1] || 0) }
    : null

  return {
    filePath,
    targetSelectionRange: {
      start: start || end || { line: 0, character: 0 },
      end: end || start || { line: 0, character: 0 },
    },
    range: {
      start: start || end || { line: 0, character: 0 },
      end: end || start || { line: 0, character: 0 },
    },
  }
}

function chooseNearestJumpPosition(positions = [], currentPage = 1) {
  const valid = (Array.isArray(positions) ? positions : [])
    .filter((entry) => Number.isFinite(entry?.page) && Number.isFinite(entry?.x) && Number.isFinite(entry?.y))
    .map(entry => ({
      page: Number(entry.page),
      x: Number(entry.x),
      y: Number(entry.y),
    }))

  if (valid.length === 0) return null
  if (!Number.isFinite(currentPage)) return valid[0]

  return [...valid].sort((left, right) => {
    const delta = Math.abs(left.page - currentPage) - Math.abs(right.page - currentPage)
    if (delta !== 0) return delta
    return left.page - right.page
  })[0] || valid[0]
}

function belongsToRootProject(sourcePath = '', rootPath = '') {
  const normalizedSource = normalizeFsPath(sourcePath)
  const normalizedRoot = normalizeFsPath(rootPath)
  if (!normalizedSource || !normalizedRoot) return false
  return resolveCachedTypstRootPath(normalizedSource) === normalizedRoot
}

async function killPreviewTask(workspacePath = null) {
  if (!previewTaskState.taskId) {
    previewTaskState.rootPath = null
    previewTaskState.workspacePath = workspacePath || null
    previewTaskState.dataPlanePort = null
    return
  }

  try {
    await requestTinymistExecuteCommand('tinymist.doKillPreview', [previewTaskState.taskId], {
      workspacePath: workspacePath || previewTaskState.workspacePath || null,
    })
  } catch {
    // Ignore stale task errors and reset local state.
  } finally {
    previewTaskState.taskId = null
    previewTaskState.rootPath = null
    previewTaskState.workspacePath = workspacePath || null
    previewTaskState.dataPlanePort = null
  }
}

async function ensurePreviewTask(rootPath, options = {}) {
  const normalizedRoot = normalizeFsPath(rootPath)
  const workspacePath = normalizeFsPath(options.workspacePath || '')
  if (!normalizedRoot) {
    throw new Error('Missing Typst preview root')
  }

  if (
    previewTaskState.taskId === TYPST_PREVIEW_TASK_ID
    && previewTaskState.rootPath === normalizedRoot
    && previewTaskState.dataPlanePort
    && previewTaskState.workspacePath === workspacePath
  ) {
    return {
      taskId: previewTaskState.taskId,
      rootPath: previewTaskState.rootPath,
      workspacePath: previewTaskState.workspacePath,
      dataPlanePort: previewTaskState.dataPlanePort,
    }
  }

  previewTaskState.startToken += 1
  const startToken = previewTaskState.startToken

  await killPreviewTask(workspacePath || null)

  const result = await requestTinymistExecuteCommand(
    'tinymist.doStartPreview',
    [[
      '--task-id',
      TYPST_PREVIEW_TASK_ID,
      '--data-plane-host',
      '127.0.0.1:0',
      normalizedRoot,
    ]],
    { workspacePath },
  )

  if (previewTaskState.startToken !== startToken) {
    throw new Error('Typst preview task was replaced before initialization finished')
  }

  const dataPlanePort = Number(result?.dataPlanePort || 0)
  if (!Number.isInteger(dataPlanePort) || dataPlanePort <= 0) {
    throw new Error('Tinymist preview did not expose a valid data plane port')
  }

  previewTaskState.taskId = TYPST_PREVIEW_TASK_ID
  previewTaskState.rootPath = normalizedRoot
  previewTaskState.workspacePath = workspacePath
  previewTaskState.dataPlanePort = dataPlanePort

  return {
    taskId: previewTaskState.taskId,
    rootPath: previewTaskState.rootPath,
    workspacePath: previewTaskState.workspacePath,
    dataPlanePort: previewTaskState.dataPlanePort,
  }
}

function waitForScrollSource(timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('Typst preview reverse sync timed out'))
    }, timeoutMs)

    const cleanup = subscribeTinymistNotification('tinymist/preview/scrollSource', (payload) => {
      const location = toNotificationJumpLocation(payload)
      if (!location) return
      window.clearTimeout(timer)
      cleanup()
      resolve(location)
    })
  })
}

subscribeTinymistNotification('tinymist/preview/dispose', (payload) => {
  if (String(payload?.taskId || '') !== TYPST_PREVIEW_TASK_ID) return
  previewTaskState.taskId = null
  previewTaskState.rootPath = null
  previewTaskState.dataPlanePort = null
})

export async function requestTypstPreviewForwardSync(options = {}) {
  const sourcePath = normalizeFsPath(options.sourcePath || '')
  const rootPath = normalizeFsPath(options.rootPath || resolveCachedTypstRootPath(sourcePath))
  const workspacePath = normalizeFsPath(options.workspacePath || '')
  const currentPage = Number(options.currentPage || 1)
  const line = Number(options.line ?? 0)
  const character = Number(options.character ?? 0)

  if (!sourcePath || !rootPath) return null

  const task = await ensurePreviewTask(rootPath, { workspacePath })
  const jumpPromise = invoke('typst_preview_wait_for_jump', {
    port: task.dataPlanePort,
    timeoutMs: Number(options.timeoutMs || DEFAULT_TIMEOUT_MS),
  })

  await requestTinymistExecuteCommand(
    'tinymist.scrollPreview',
    [
      task.taskId,
      {
        event: 'panelScrollTo',
        filepath: sourcePath,
        line,
        character,
      },
    ],
    { workspacePath },
  )

  const positions = await jumpPromise
  return chooseNearestJumpPosition(positions, currentPage)
}

export async function requestTypstPreviewBackwardSync(options = {}) {
  const rootPath = normalizeFsPath(options.rootPath || '')
  const workspacePath = normalizeFsPath(options.workspacePath || '')
  const page = Number(options.page || 0)
  const x = Number(options.x || 0)
  const y = Number(options.y || 0)

  if (!rootPath || !Number.isFinite(page) || page < 1) return null

  const task = await ensurePreviewTask(rootPath, { workspacePath })
  const waitPromise = waitForScrollSource(Number(options.timeoutMs || DEFAULT_TIMEOUT_MS))

  await invoke('typst_preview_send_src_point', {
    port: task.dataPlanePort,
    page,
    x,
    y,
  })

  return waitPromise
}

export function rememberPendingTypstForwardSync(detail = {}) {
  const sourcePath = normalizeFsPath(detail.sourcePath || '')
  const line = Number(detail.line ?? -1)
  const character = Number(detail.character ?? -1)
  if (!sourcePath || !Number.isInteger(line) || line < 0 || !Number.isInteger(character) || character < 0) {
    return null
  }

  pendingForwardSync = {
    sourcePath,
    line,
    character,
  }

  return pendingForwardSync
}

export function clearPendingTypstForwardSync(detail = null) {
  if (!pendingForwardSync) return
  if (!detail) {
    pendingForwardSync = null
    return
  }

  const sourcePath = normalizeFsPath(detail.sourcePath || '')
  const line = Number(detail.line ?? -1)
  const character = Number(detail.character ?? -1)
  if (
    pendingForwardSync.sourcePath === sourcePath
    && pendingForwardSync.line === line
    && pendingForwardSync.character === character
  ) {
    pendingForwardSync = null
  }
}

export function takePendingTypstForwardSync(rootPath = '') {
  if (!pendingForwardSync) return null
  if (!belongsToRootProject(pendingForwardSync.sourcePath, rootPath)) return null
  const detail = pendingForwardSync
  pendingForwardSync = null
  return detail
}

export function sourceBelongsToTypstPreviewRoot(sourcePath = '', rootPath = '') {
  return belongsToRootProject(sourcePath, rootPath)
}

export async function resetTypstPreviewSync(workspacePath = null) {
  await killPreviewTask(workspacePath)
}
