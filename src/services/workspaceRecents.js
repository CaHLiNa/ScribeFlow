import { invoke } from '@tauri-apps/api/core'
import { basenamePath } from '../utils/path'
import {
  clearStorageKeys,
  hasDesktopInvoke,
  readStorageBoolean,
  readStorageJson,
  readStorageValue,
  writeStorageJson,
  writeStorageValue,
} from './bridgeStorage.js'

const MAX_RECENT_WORKSPACES = 10

export function createWorkspaceLifecycleState() {
  return {
    recentWorkspaces: [],
    lastWorkspace: '',
    setupComplete: false,
    reopenLastWorkspaceOnLaunch: true,
    reopenLastSessionOnLaunch: true,
  }
}

function readLegacyRecentWorkspaces() {
  const parsed = readStorageJson('recentWorkspaces', [])
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((item) => item && item.path)
    .map((item) => ({
      path: String(item.path || ''),
      name: basenamePath(item.path) || String(item.name || item.path),
      lastOpened: String(item.lastOpened || ''),
    }))
}

function readLegacyLastWorkspace() {
  return String(readStorageValue('lastWorkspace', ''))
}

function readLegacySetupComplete() {
  return readStorageBoolean('setupComplete', false)
}

function clearLegacyWorkspaceLifecycleStorage() {
  clearStorageKeys([
    'recentWorkspaces',
    'lastWorkspace',
    'setupComplete',
    'reopenLastWorkspaceOnLaunch',
    'reopenLastSessionOnLaunch',
  ])
}

function normalizeRecentWorkspaces(recentWorkspaces = []) {
  const seen = new Set()
  const next = []

  for (const item of Array.isArray(recentWorkspaces) ? recentWorkspaces : []) {
    const path = String(item?.path || '').replace(/\/+$/, '')
    if (!path || seen.has(path)) continue
    seen.add(path)
    next.push({
      path,
      name: basenamePath(path) || String(item?.name || path),
      lastOpened: String(item?.lastOpened || ''),
    })
    if (next.length >= MAX_RECENT_WORKSPACES) break
  }

  return next
}

function normalizeWorkspaceLifecycleState(state = {}) {
  return {
    recentWorkspaces: normalizeRecentWorkspaces(state.recentWorkspaces),
    lastWorkspace: String(state.lastWorkspace || '').replace(/\/+$/, ''),
    setupComplete: state.setupComplete === true,
    reopenLastWorkspaceOnLaunch: state.reopenLastWorkspaceOnLaunch !== false,
    reopenLastSessionOnLaunch: state.reopenLastSessionOnLaunch !== false,
  }
}

function loadBrowserPreviewWorkspaceLifecycleState() {
  const state = normalizeWorkspaceLifecycleState({
    recentWorkspaces: readLegacyRecentWorkspaces(),
    lastWorkspace: readLegacyLastWorkspace(),
    setupComplete: readLegacySetupComplete(),
    reopenLastWorkspaceOnLaunch: readStorageBoolean('reopenLastWorkspaceOnLaunch', true),
    reopenLastSessionOnLaunch: readStorageBoolean('reopenLastSessionOnLaunch', true),
  })
  clearLegacyWorkspaceLifecycleStorage()
  return state
}

function saveBrowserPreviewWorkspaceLifecycleState(state = {}) {
  const normalized = normalizeWorkspaceLifecycleState(state)
  writeStorageJson('recentWorkspaces', normalized.recentWorkspaces)
  writeStorageValue('lastWorkspace', normalized.lastWorkspace)
  writeStorageValue('setupComplete', normalized.setupComplete ? 'true' : 'false')
  writeStorageValue(
    'reopenLastWorkspaceOnLaunch',
    normalized.reopenLastWorkspaceOnLaunch ? 'true' : 'false'
  )
  writeStorageValue(
    'reopenLastSessionOnLaunch',
    normalized.reopenLastSessionOnLaunch ? 'true' : 'false'
  )
  return normalized
}

export async function loadWorkspaceLifecycleState(globalConfigDir = '') {
  if (!hasDesktopInvoke()) {
    return loadBrowserPreviewWorkspaceLifecycleState()
  }

  const state = await invoke('workspace_lifecycle_load', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      legacyState: {
        recentWorkspaces: readLegacyRecentWorkspaces(),
        lastWorkspace: readLegacyLastWorkspace(),
        setupComplete: readLegacySetupComplete(),
        reopenLastWorkspaceOnLaunch: readStorageBoolean('reopenLastWorkspaceOnLaunch', true),
        reopenLastSessionOnLaunch: readStorageBoolean('reopenLastSessionOnLaunch', true),
      },
    },
  })

  clearLegacyWorkspaceLifecycleStorage()
  return {
    ...createWorkspaceLifecycleState(),
    ...state,
    recentWorkspaces: normalizeRecentWorkspaces(state?.recentWorkspaces),
  }
}

export async function saveWorkspaceLifecycleState(globalConfigDir = '', state = {}) {
  if (!hasDesktopInvoke()) {
    return saveBrowserPreviewWorkspaceLifecycleState(state)
  }

  const normalized = await invoke('workspace_lifecycle_save', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      state,
    },
  })

  clearLegacyWorkspaceLifecycleStorage()
  return {
    ...createWorkspaceLifecycleState(),
    ...normalized,
    recentWorkspaces: normalizeRecentWorkspaces(normalized?.recentWorkspaces),
  }
}

export function buildNextRecentWorkspaces(current = [], path = '') {
  const normalizedPath = String(path || '').replace(/\/+$/, '')
  if (!normalizedPath) return normalizeRecentWorkspaces(current)

  const next = normalizeRecentWorkspaces(current).filter((item) => item.path !== normalizedPath)
  next.unshift({
    path: normalizedPath,
    name: basenamePath(normalizedPath) || normalizedPath,
    lastOpened: new Date().toISOString(),
  })
  if (next.length > MAX_RECENT_WORKSPACES) next.length = MAX_RECENT_WORKSPACES
  return next
}
