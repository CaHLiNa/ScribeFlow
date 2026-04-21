import { invoke } from '@tauri-apps/api/core'

const STATE_FILE = 'editor-state.json'
const STATE_VERSION = 1

function isPreviewPath(path = '') {
  return path.startsWith('preview:')
}

function previewSourcePathFromPath(path = '') {
  if (path.startsWith('preview:')) return path.slice('preview:'.length)
  return ''
}

function isVirtualNewTab(path = '') {
  return path.startsWith('newtab:')
}

function isVirtualDraftTab(path = '') {
  return path.startsWith('draft:')
}

const REMOVED_VIRTUAL_TAB_PREFIXES = ['library:', 'ref:@']

function isRemovedVirtualTabPath(path = '') {
  return REMOVED_VIRTUAL_TAB_PREFIXES.some((prefix) => path.startsWith(prefix))
}

function normalizeLegacyPreviewPathSet(legacyPreviewPaths = []) {
  if (legacyPreviewPaths instanceof Set) return legacyPreviewPaths
  return new Set(Array.isArray(legacyPreviewPaths) ? legacyPreviewPaths : [])
}

export function collectLegacyPreviewPaths(node) {
  if (!node) return []
  if (node.type === 'leaf') {
    return (node.tabs || []).filter((tab) => isPreviewPath(tab))
  }
  if (node.type === 'split' && Array.isArray(node.children)) {
    return node.children.flatMap((child) => collectLegacyPreviewPaths(child))
  }
  return []
}

export function serializePaneTree(node, options = {}) {
  const preservedLegacyPreviewPaths = normalizeLegacyPreviewPathSet(options.preservedLegacyPreviewPaths)
  if (!node) return null

  if (node.type === 'leaf') {
    const tabs = (node.tabs || []).filter((tab) => (
      tab
      && typeof tab === 'string'
      && !isVirtualDraftTab(tab)
      && !isRemovedVirtualTabPath(tab)
      && (!isPreviewPath(tab) || preservedLegacyPreviewPaths.has(tab))
    ))
    if (tabs.length === 0) return null
    const activeTab = tabs.includes(node.activeTab) ? node.activeTab : (tabs[0] || null)
    return { type: 'leaf', id: node.id, tabs, activeTab }
  }

  if (node.type === 'split' && Array.isArray(node.children)) {
    const children = node.children
      .map((child) => serializePaneTree(child, options))
      .filter(Boolean)
    if (children.length < 2) return children[0] || null
    return { type: 'split', direction: node.direction, ratio: node.ratio, children }
  }

  return null
}

export function buildPersistedEditorState({
  paneTree,
  activePaneId,
  legacyPreviewPaths = [],
} = {}) {
  return {
    version: STATE_VERSION,
    paneTree: serializePaneTree(paneTree, {
      preservedLegacyPreviewPaths: legacyPreviewPaths,
    }),
    activePaneId,
  }
}

export function normalizeLoadedEditorState(state) {
  if (!state || state.version !== STATE_VERSION || !state.paneTree) return null

  const legacyPreviewPaths = collectLegacyPreviewPaths(state.paneTree)
  return {
    ...state,
    legacyPrimarySurface: null,
    legacyPreviewPaths,
    paneTree: serializePaneTree(state.paneTree, {
      preservedLegacyPreviewPaths: legacyPreviewPaths,
    }),
  }
}

export async function saveState(workspaceDataDir, paneTree, activePaneId, options = {}) {
  if (!workspaceDataDir) return
  try {
    const state = buildPersistedEditorState({
      paneTree,
      activePaneId,
      legacyPreviewPaths: options.legacyPreviewPaths,
    })
    await invoke('write_file', {
      path: `${workspaceDataDir}/${STATE_FILE}`,
      content: JSON.stringify(state, null, 2),
    })
  } catch (error) {
    console.error('[editorPersistence] Failed to save:', error)
  }
}

export async function loadState(workspaceDataDir) {
  if (!workspaceDataDir) return null
  try {
    const filePath = `${workspaceDataDir}/${STATE_FILE}`
    const exists = await invoke('path_exists', { path: filePath })
    if (!exists) return null
    const content = await invoke('read_file', { path: filePath })
    return normalizeLoadedEditorState(JSON.parse(content))
  } catch (error) {
    console.error('[editorPersistence] Failed to load:', error)
    return null
  }
}

function collectAllTabs(node) {
  if (!node) return []
  if (node.type === 'leaf') return [...(node.tabs || [])]
  if (node.type === 'split' && Array.isArray(node.children)) {
    return node.children.flatMap((child) => collectAllTabs(child))
  }
  return []
}

async function isTabValid(tab) {
  if (!tab || typeof tab !== 'string') return false
  if (isRemovedVirtualTabPath(tab)) return false
  if (isVirtualNewTab(tab)) return true
  if (isVirtualDraftTab(tab)) return false

  const targetPath = isPreviewPath(tab) ? previewSourcePathFromPath(tab) : tab
  if (!targetPath) return false

  try {
    return await invoke('path_exists', { path: targetPath })
  } catch {
    return false
  }
}

export async function findInvalidTabs(_workspaceDataDir, paneTree) {
  const allTabs = collectAllTabs(paneTree)
  if (allTabs.length === 0) return new Set()

  const results = await Promise.all(allTabs.map(async (tab) => ({
    tab,
    valid: await isTabValid(tab),
  })))

  const invalid = new Set()
  for (const { tab, valid } of results) {
    if (!valid) invalid.add(tab)
  }
  return invalid
}
