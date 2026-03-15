import { invoke } from '@tauri-apps/api/core'
import { isMac } from '../platform'

const BOOKMARKS_KEY = 'workspaceBookmarks'

function normalizeWorkspacePath(path = '') {
  const trimmed = String(path || '').trim().replace(/\/+$/, '')
  return trimmed || '/'
}

function readBookmarks() {
  try {
    return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeBookmarks(bookmarks) {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks))
}

export function getWorkspaceBookmark(path) {
  if (!path) return ''
  const bookmarks = readBookmarks()
  return bookmarks[normalizeWorkspacePath(path)] || ''
}

export function setWorkspaceBookmark(path, bookmark) {
  if (!path || !bookmark) return
  const bookmarks = readBookmarks()
  bookmarks[normalizeWorkspacePath(path)] = bookmark
  writeBookmarks(bookmarks)
}

export function moveWorkspaceBookmark(oldPath, newPath, fallbackBookmark = '') {
  const bookmarks = readBookmarks()
  const oldKey = normalizeWorkspacePath(oldPath)
  const newKey = normalizeWorkspacePath(newPath)
  const bookmark = bookmarks[oldKey] || fallbackBookmark
  if (oldKey !== newKey) {
    delete bookmarks[oldKey]
  }
  if (bookmark) {
    bookmarks[newKey] = bookmark
  }
  writeBookmarks(bookmarks)
}

export function removeWorkspaceBookmark(path) {
  if (!path) return
  const bookmarks = readBookmarks()
  delete bookmarks[normalizeWorkspacePath(path)]
  writeBookmarks(bookmarks)
}

export async function captureWorkspaceBookmark(path) {
  if (!isMac || !path) return path
  try {
    const normalizedPath = normalizeWorkspacePath(path)
    const bookmark = await invoke('macos_create_workspace_bookmark', { path: normalizedPath })
    if (bookmark) {
      setWorkspaceBookmark(normalizedPath, bookmark)
    }
    return normalizedPath
  } catch (error) {
    console.warn('[workspace-permissions] Failed to create workspace bookmark:', error)
    return normalizeWorkspacePath(path)
  }
}

export async function activateWorkspaceBookmark(path) {
  const normalizedPath = normalizeWorkspacePath(path)
  if (!isMac || !normalizedPath) return normalizedPath

  const bookmark = getWorkspaceBookmark(normalizedPath)
  if (!bookmark) return normalizedPath

  try {
    const result = await invoke('macos_activate_workspace_bookmark', { bookmark })
    const resolvedPath = normalizeWorkspacePath(result?.path || normalizedPath)
    const refreshedBookmark = result?.bookmark || bookmark
    moveWorkspaceBookmark(normalizedPath, resolvedPath, refreshedBookmark)
    return resolvedPath
  } catch (error) {
    console.warn('[workspace-permissions] Failed to activate workspace bookmark:', error)
    return normalizedPath
  }
}

export async function releaseWorkspaceBookmark(path) {
  if (!isMac || !path) return
  try {
    await invoke('macos_release_workspace_access', { path: normalizeWorkspacePath(path) })
  } catch (error) {
    console.warn('[workspace-permissions] Failed to release workspace bookmark:', error)
  }
}
