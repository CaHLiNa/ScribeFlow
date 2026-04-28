import {
  clearStorageKeys,
  readStorageValue,
} from './bridgeStorage.js'

const DEFAULT_LEFT_SIDEBAR_WIDTH = 240
const DEFAULT_RIGHT_SIDEBAR_WIDTH = 360
const DEFAULT_BOTTOM_PANEL_HEIGHT = 250
const LEGACY_LAYOUT_STORAGE_KEYS = ['leftSidebarWidth', 'rightSidebarWidth', 'bottomPanelHeight']

function readNumberFromStorage(key, fallback) {
  const raw = readStorageValue(key, '')
  if (!raw) return fallback
  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function readLegacyWorkbenchLayoutState() {
  return {
    leftSidebarWidth: readNumberFromStorage('leftSidebarWidth', DEFAULT_LEFT_SIDEBAR_WIDTH),
    rightSidebarWidth: readNumberFromStorage('rightSidebarWidth', DEFAULT_RIGHT_SIDEBAR_WIDTH),
    bottomPanelHeight: readNumberFromStorage('bottomPanelHeight', DEFAULT_BOTTOM_PANEL_HEIGHT),
  }
}

export function clearLegacyWorkbenchLayoutState() {
  clearStorageKeys(LEGACY_LAYOUT_STORAGE_KEYS)
}
