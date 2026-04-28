import {
  clearStorageKeys,
  readStorageJson,
} from './bridgeStorage.js'

const BOOKMARKS_KEY = 'workspaceBookmarks'

export function normalizeWorkspaceBookmarkPath(path = '') {
  const trimmed = String(path || '').trim().replace(/\/+$/, '')
  return trimmed || '/'
}

export function readLegacyWorkspaceBookmarks() {
  const parsed = readStorageJson(BOOKMARKS_KEY, {})
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
}

export function clearLegacyWorkspaceBookmarks() {
  clearStorageKeys([BOOKMARKS_KEY])
}
