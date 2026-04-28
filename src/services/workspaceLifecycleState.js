import { basenamePath } from '../utils/path'
import {
  clearStorageKeys,
  readStorageBoolean,
  readStorageJson,
  readStorageValue,
} from './bridgeStorage.js'

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

export function readLegacyWorkspaceLifecycleState() {
  return {
    recentWorkspaces: readLegacyRecentWorkspaces(),
    lastWorkspace: readLegacyLastWorkspace(),
    setupComplete: readLegacySetupComplete(),
    reopenLastWorkspaceOnLaunch: readStorageBoolean('reopenLastWorkspaceOnLaunch', true),
    reopenLastSessionOnLaunch: readStorageBoolean('reopenLastSessionOnLaunch', true),
  }
}

export function clearLegacyWorkspaceLifecycleStorage() {
  clearStorageKeys([
    'recentWorkspaces',
    'lastWorkspace',
    'setupComplete',
    'reopenLastWorkspaceOnLaunch',
    'reopenLastSessionOnLaunch',
  ])
}
