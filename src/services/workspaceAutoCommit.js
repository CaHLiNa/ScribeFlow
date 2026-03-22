import { gitAdd, gitCommit, gitStatus } from './git'
import { invoke } from '@tauri-apps/api/core'
import { pathExists } from './pathExists.js'
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
