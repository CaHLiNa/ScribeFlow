import { gitAdd, gitCommit, gitInit, gitLog, gitStatus } from './git'
import { invoke } from '@tauri-apps/api/core'
import { pathExists } from './workspaceBootstrap'
import { getHomeDirCached, normalizePathValue } from './workspacePaths'

const AUTO_COMMIT_MARKER = 'altals-auto-commit-enabled'

function autoCommitMarkerPath(path = '') {
  const normalizedPath = normalizePathValue(path)
  if (!normalizedPath || normalizedPath === '/') return ''
  return `${normalizedPath}/.git/${AUTO_COMMIT_MARKER}`
}

export async function enableWorkspaceAutoCommit(path = '') {
  const markerPath = autoCommitMarkerPath(path)
  if (!markerPath) return false
  const repoPath = `${normalizePathValue(path)}/.git`
  if (!(await pathExists(repoPath))) return false
  await invoke('write_file', { path: markerPath, content: '1\n' })
  return true
}

export async function canAutoCommitWorkspace(path = '') {
  if (!path) return false
  const normalizedPath = normalizePathValue(path)
  const normalizedHome = await getHomeDirCached()
  if (normalizedHome && normalizedPath === normalizedHome) {
    return false
  }
  return pathExists(autoCommitMarkerPath(normalizedPath))
}

export async function ensureWorkspaceHistoryRepo(path = '', options = {}) {
  const {
    seedInitialCommit = false,
    seedMessage = 'Initial snapshot',
    enableAutoCommit: shouldEnableAutoCommit = false,
  } = options
  if (!path) return { ok: false, reason: 'missing' }

  const normalizedPath = normalizePathValue(path)
  const normalizedHome = await getHomeDirCached()
  if (normalizedHome && normalizedPath === normalizedHome) {
    return { ok: false, reason: 'home' }
  }

  const hasRepo = await pathExists(`${normalizedPath}/.git`)
  let initialized = false
  if (hasRepo) {
    initialized = false
  } else {
    await gitInit(normalizedPath)
    initialized = true
  }

  let autoCommitEnabled = await canAutoCommitWorkspace(normalizedPath)
  if (shouldEnableAutoCommit && !autoCommitEnabled) {
    autoCommitEnabled = await enableWorkspaceAutoCommit(normalizedPath).catch(() => false)
  }

  if (!seedInitialCommit) {
    return { ok: true, initialized, seeded: false, autoCommitEnabled }
  }

  const commits = await gitLog(normalizedPath, null, 1)
  if (commits.length > 0) {
    return { ok: true, initialized, seeded: false, autoCommitEnabled }
  }

  await gitAdd(normalizedPath)
  const status = await gitStatus(normalizedPath)
  if (!status.trim()) {
    return { ok: true, initialized, seeded: false, empty: true, autoCommitEnabled }
  }

  await gitCommit(normalizedPath, seedMessage)
  return { ok: true, initialized, seeded: true, autoCommitEnabled }
}

export async function runWorkspaceAutoCommit(path = '') {
  if (!(await canAutoCommitWorkspace(path))) return { committed: false }

  await gitAdd(path)
  const status = await gitStatus(path)
  if (!status.trim()) {
    return { committed: false }
  }

  const now = new Date()
  const timestamp = now.toISOString().replace('T', ' ').substring(0, 16)
  await gitCommit(path, `Auto: ${timestamp}`)
  return {
    committed: true,
    timestamp,
  }
}
