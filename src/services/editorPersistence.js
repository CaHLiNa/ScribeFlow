import { invoke } from '@tauri-apps/api/core'

const STATE_VERSION = 1

function isPreviewPath(path = '') {
  return path.startsWith('preview:')
}

function isVirtualNewTab(path = '') {
  return path.startsWith('newtab:')
}

function isContextCandidatePath(path = '') {
  return !!path && !isVirtualNewTab(path) && !isPreviewPath(path)
}

function createEmptyState() {
  return {
    version: STATE_VERSION,
    paneTree: {
      type: 'leaf',
      id: 'pane-root',
      tabs: [],
      activeTab: null,
    },
    activePaneId: 'pane-root',
    documentDockTabs: [],
    activeDocumentDockTab: '',
    lastContextPath: '',
  }
}

export async function saveState(workspaceDataDir, paneTree, activePaneId, options = {}) {
  if (!workspaceDataDir) return null
  return invoke('editor_session_save', {
    params: {
      workspaceDataDir,
      paneTree,
      activePaneId,
      documentDockTabs: Array.isArray(options.documentDockTabs)
        ? options.documentDockTabs
        : Array.from(options.documentDockTabs || []),
      activeDocumentDockTab: String(options.activeDocumentDockTab || ''),
      lastContextPath: String(options.lastContextPath || ''),
    },
  })
}

export async function loadState(workspaceDataDir) {
  if (!workspaceDataDir) return null

  const loaded = await invoke('editor_session_load', {
    params: {
      workspaceDataDir,
    },
  })
  return loaded && typeof loaded === 'object' ? loaded : null
}

function normalizeRecentFiles(recentFiles = []) {
  const seen = new Set()
  const normalized = []
  for (const entry of Array.isArray(recentFiles) ? recentFiles : []) {
    const path = String(entry?.path || '').trim()
    if (!path || seen.has(path)) continue
    seen.add(path)
    normalized.push({
      path,
      openedAt: Number(entry?.openedAt) || 0,
    })
    if (normalized.length >= 20) break
  }
  return normalized
}

export async function loadRecentFiles(workspaceDataDir = '') {
  if (!workspaceDataDir) return []

  const recentFiles = await invoke('editor_recent_files_load', {
    params: {
      workspaceDataDir,
    },
  })
  return normalizeRecentFiles(recentFiles)
}

export async function saveRecentFiles(workspaceDataDir = '', _workspacePath = '', recentFiles = []) {
  const normalized = normalizeRecentFiles(recentFiles)
  if (!workspaceDataDir) return normalized

  const saved = await invoke('editor_recent_files_save', {
    params: {
      workspaceDataDir,
      recentFiles: normalized,
    },
  })
  return normalizeRecentFiles(saved)
}

export async function findInvalidTabs(_workspaceDataDir, paneTree) {
  if (!paneTree || typeof paneTree !== 'object') return new Set()

  const tabs = []
  const walk = (node) => {
    if (!node) return
    if (node.type === 'leaf') {
      for (const tab of node.tabs || []) tabs.push(tab)
      return
    }
    for (const child of node.children || []) walk(child)
  }
  walk(paneTree)

  const openTabs = new Set(tabs.filter((tab) => typeof tab === 'string' && tab))
  return new Set(
    tabs.filter((tab) => typeof tab === 'string' && isContextCandidatePath(tab) && !openTabs.has(tab))
  )
}
