/**
 * Editor state persistence: save/restore pane tree to external Altals metadata storage.
 *
 * Optimistic restore: sets the pane tree immediately for instant UI, then validates
 * tabs in parallel and prunes invalid ones after the fact.
 */
import { invoke } from '@tauri-apps/api/core'
import {
  isAiWorkbenchPath,
  isChatTab,
  getChatSessionId,
  isLibraryPath,
  isReferencePath,
  referenceKeyFromPath,
  isPreviewPath,
  isNewTab,
  isAiLauncher,
  previewSourcePathFromPath,
} from '../utils/fileTypes.js'

const STATE_FILE = 'editor-state.json'
const STATE_VERSION = 1

function normalizeLegacyPreviewPathSet(legacyPreviewPaths = []) {
  if (legacyPreviewPaths instanceof Set) return legacyPreviewPaths
  return new Set(Array.isArray(legacyPreviewPaths) ? legacyPreviewPaths : [])
}

function detectLegacyPrimarySurface(node) {
  if (!node) return null
  if (node.type === 'leaf') {
    const tabs = node.tabs || []
    if (tabs.some(tab => isAiWorkbenchPath(tab))) return 'ai'
    if (tabs.some(tab => isLibraryPath(tab))) return 'library'
    return null
  }
  if (node.type === 'split' && Array.isArray(node.children)) {
    for (const child of node.children) {
      const detected = detectLegacyPrimarySurface(child)
      if (detected) return detected
    }
  }
  return null
}

/**
 * Recursively serialize a pane tree to a plain JSON-safe object.
 */
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
    const tabs = (node.tabs || []).filter((t) => (
      t
      && typeof t === 'string'
      && !isLibraryPath(t)
      && !isAiWorkbenchPath(t)
      && (!isPreviewPath(t) || preservedLegacyPreviewPaths.has(t))
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
    legacyPrimarySurface: detectLegacyPrimarySurface(state.paneTree),
    legacyPreviewPaths,
    paneTree: serializePaneTree(state.paneTree, {
      preservedLegacyPreviewPaths: legacyPreviewPaths,
    }),
  }
}

/**
 * Save the pane tree + active pane to disk.
 */
export async function saveState(shouldersDir, paneTree, activePaneId, options = {}) {
  if (!shouldersDir) return
  try {
    const state = buildPersistedEditorState({
      paneTree,
      activePaneId,
      legacyPreviewPaths: options.legacyPreviewPaths,
    })
    await invoke('write_file', {
      path: `${shouldersDir}/${STATE_FILE}`,
      content: JSON.stringify(state, null, 2),
    })
  } catch (e) {
    console.error('[editorPersistence] Failed to save:', e)
  }
}

/**
 * Load raw state from disk. Returns null if file missing/corrupt.
 */
export async function loadState(shouldersDir) {
  if (!shouldersDir) return null
  try {
    const filePath = `${shouldersDir}/${STATE_FILE}`
    const exists = await invoke('path_exists', { path: filePath })
    if (!exists) return null

    const content = await invoke('read_file', { path: filePath })
    return normalizeLoadedEditorState(JSON.parse(content))
  } catch (e) {
    console.error('[editorPersistence] Failed to load:', e)
    return null
  }
}

/**
 * Collect all tab paths from a pane tree.
 */
function collectAllTabs(node) {
  if (!node) return []
  if (node.type === 'leaf') return [...(node.tabs || [])]
  if (node.type === 'split' && Array.isArray(node.children)) {
    return node.children.flatMap(c => collectAllTabs(c))
  }
  return []
}

/**
 * Validate all tabs in parallel. Returns a Set of invalid tab paths.
 */
export async function findInvalidTabs(shouldersDir, paneTree) {
  const allTabs = collectAllTabs(paneTree)
  if (allTabs.length === 0) return new Set()

  const results = await Promise.all(
    allTabs.map(async (tab) => {
      const valid = await isTabValid(tab, shouldersDir)
      return { tab, valid }
    })
  )

  const invalid = new Set()
  for (const { tab, valid } of results) {
    if (!valid) invalid.add(tab)
  }
  return invalid
}

/**
 * Check if a single tab path points to something that still exists.
 */
async function isTabValid(tab, shouldersDir) {
  if (!tab || typeof tab !== 'string') return false

  if (isLibraryPath(tab) || isAiWorkbenchPath(tab)) return false

  // NewTab tabs are always valid (virtual, ephemeral)
  if (isNewTab(tab) || isAiLauncher(tab)) return true

  // Chat tabs: check if session file exists on disk
  if (isChatTab(tab)) {
    const sessionId = getChatSessionId(tab)
    if (!sessionId || !shouldersDir) return false
    try {
      return await invoke('path_exists', { path: `${shouldersDir}/chats/${sessionId}.json` })
    } catch { return false }
  }

  // Reference tabs: check if key exists in loaded library
  if (isReferencePath(tab)) {
    const key = referenceKeyFromPath(tab)
    if (!key) return false
    try {
      const { useReferencesStore } = await import('../stores/references.js')
      return useReferencesStore().getByKey(key) !== null
    } catch { return false }
  }

  // Preview tabs: validate the underlying file path
  if (isPreviewPath(tab)) {
    const underlyingPath = previewSourcePathFromPath(tab)
    if (!underlyingPath) return false
    try {
      return await invoke('path_exists', { path: underlyingPath })
    } catch { return false }
  }

  // Regular file paths: check existence on disk
  try {
    return await invoke('path_exists', { path: tab })
  } catch { return false }
}
