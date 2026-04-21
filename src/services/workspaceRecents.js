import { invoke } from '@tauri-apps/api/core'
import { basenamePath } from '../utils/path'

const MAX_RECENT_WORKSPACES = 10

export function createWorkspaceLifecycleState() {
  return {
    recentWorkspaces: [],
    lastWorkspace: '',
    setupComplete: false,
  }
}

function hasTauriInvoke() {
  return typeof window !== 'undefined' && typeof window.__TAURI_INTERNALS__?.invoke === 'function'
}

function readLegacyRecentWorkspaces() {
  try {
    const parsed = JSON.parse(localStorage.getItem('recentWorkspaces') || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && item.path)
      .map((item) => ({
        path: String(item.path || ''),
        name: basenamePath(item.path) || String(item.name || item.path),
        lastOpened: String(item.lastOpened || ''),
      }))
  } catch {
    return []
  }
}

function readLegacyLastWorkspace() {
  try {
    return String(localStorage.getItem('lastWorkspace') || '')
  } catch {
    return ''
  }
}

function readLegacySetupComplete() {
  try {
    return localStorage.getItem('setupComplete') === 'true'
  } catch {
    return false
  }
}

function clearLegacyWorkspaceLifecycleStorage() {
  try {
    localStorage.removeItem('recentWorkspaces')
    localStorage.removeItem('lastWorkspace')
    localStorage.removeItem('setupComplete')
  } catch {
    // Ignore localStorage failures.
  }
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
  }
}

function loadBrowserPreviewWorkspaceLifecycleState() {
  const state = normalizeWorkspaceLifecycleState({
    recentWorkspaces: readLegacyRecentWorkspaces(),
    lastWorkspace: readLegacyLastWorkspace(),
    setupComplete: readLegacySetupComplete(),
  })
  clearLegacyWorkspaceLifecycleStorage()
  return state
}

function saveBrowserPreviewWorkspaceLifecycleState(state = {}) {
  const normalized = normalizeWorkspaceLifecycleState(state)
  try {
    localStorage.setItem('recentWorkspaces', JSON.stringify(normalized.recentWorkspaces))
    if (normalized.lastWorkspace) {
      localStorage.setItem('lastWorkspace', normalized.lastWorkspace)
    } else {
      localStorage.removeItem('lastWorkspace')
    }
    localStorage.setItem('setupComplete', normalized.setupComplete ? 'true' : 'false')
  } catch {
    // Ignore browser preview storage failures.
  }
  return normalized
}

export async function loadWorkspaceLifecycleState(globalConfigDir = '') {
  if (!hasTauriInvoke()) {
    return loadBrowserPreviewWorkspaceLifecycleState()
  }

  const state = await invoke('workspace_lifecycle_load', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      legacyState: {
        recentWorkspaces: readLegacyRecentWorkspaces(),
        lastWorkspace: readLegacyLastWorkspace(),
        setupComplete: readLegacySetupComplete(),
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
  if (!hasTauriInvoke()) {
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
