import { invoke } from '@tauri-apps/api/core'
import { basenamePath } from '../utils/path'
import {
  clearStorageKeys,
  readStorageBoolean,
  readStorageJson,
  readStorageValue,
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

export async function loadWorkspaceLifecycleState(globalConfigDir = '') {
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
  return state
}

export async function saveWorkspaceLifecycleState(globalConfigDir = '', state = {}) {
  const normalized = await invoke('workspace_lifecycle_save', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      state,
    },
  })

  clearLegacyWorkspaceLifecycleStorage()
  return normalized
}

export async function recordWorkspaceOpened(globalConfigDir = '', path = '') {
  const state = await invoke('workspace_lifecycle_record_opened', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      path: String(path || ''),
    },
  })

  clearLegacyWorkspaceLifecycleStorage()
  return state
}
