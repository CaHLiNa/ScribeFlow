import { getCurrentWebview } from '@tauri-apps/api/webview'
import {
  ALL_WORKBENCH_SIDEBAR_PANELS,
  normalizeWorkbenchSidebarPanel,
  normalizeWorkbenchSurface,
} from '../shared/workbenchSidebarPanels.js'
import {
  ALL_WORKBENCH_INSPECTOR_PANELS,
  normalizeWorkbenchInspectorPanel,
} from '../shared/workbenchInspectorPanels.js'
import { normalizeWorkspaceThemeId } from '../shared/workspaceThemeOptions.js'

const THEME_CLASSES = [
  'theme-light',
  'theme-dark',
  'theme-system',
  'theme-monokai',
  'theme-nord',
  'theme-solarized',
  'theme-humane',
  'theme-one-light',
  'theme-dracula',
]

const PROSE_FONT_STACKS = {
  inter: "'Inter', system-ui, sans-serif",
  stix: "'STIX Two Text', Georgia, serif",
  mono: "'JetBrains Mono', 'Menlo', 'Consolas', monospace",
}

const DEFAULT_EDITOR_FONT_SIZE = 14
const DEFAULT_UI_FONT_SIZE = 13
const MIN_EDITOR_FONT_SIZE = 12
const MAX_EDITOR_FONT_SIZE = 20
const DEFAULT_APP_ZOOM_PERCENT = 100
const APP_ZOOM_KEY = 'appZoomPercent'
const SYSTEM_THEME_MEDIA = '(prefers-color-scheme: dark)'

export const EDITOR_FONT_SIZE_PRESETS = [12, 13, 14, 15, 16, 18]

export const APP_ZOOM_PRESETS = [100]

let activeWorkspaceTheme = 'system'
let systemThemeQuery = null
let removeSystemThemeListener = null

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function hasStoredValue(key) {
  try {
    return localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

function readString(key, fallback = '') {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function readEnum(key, allowedValues = [], fallback) {
  const value = readString(key, fallback)
  return allowedValues.includes(value) ? value : fallback
}

function readBoolean(key, fallback = false, falseValue = 'false') {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return raw !== falseValue
  } catch {
    return fallback
  }
}

function readTrueOnlyBoolean(key, fallback = false) {
  try {
    return localStorage.getItem(key) === 'true' || fallback
  } catch {
    return fallback
  }
}

function readNumber(key, fallback) {
  try {
    const parsed = parseInt(localStorage.getItem(key) || '', 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
  } catch {
    return fallback
  }
}

function writeValue(key, value) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Ignore localStorage failures.
  }
}

export function normalizeAppZoomPercent(value) {
  const parsed = Math.round(Number(value) || DEFAULT_APP_ZOOM_PERCENT)
  return clamp(parsed, APP_ZOOM_PRESETS[0], APP_ZOOM_PRESETS[APP_ZOOM_PRESETS.length - 1])
}

export function normalizeEditorFontSize(value) {
  const parsed = Math.round(Number(value) || DEFAULT_EDITOR_FONT_SIZE)
  return clamp(parsed, MIN_EDITOR_FONT_SIZE, MAX_EDITOR_FONT_SIZE)
}

function _nearestAppZoomPreset(value) {
  const normalized = normalizeAppZoomPercent(value)
  return APP_ZOOM_PRESETS.reduce(
    (closest, preset) =>
      Math.abs(preset - normalized) < Math.abs(closest - normalized) ? preset : closest,
    APP_ZOOM_PRESETS[0]
  )
}

function readWorkspaceThemePreference() {
  return normalizeWorkspaceThemeId(readString('theme', 'system'))
}

function migrateLegacyFooterZoom(editorFontSize, uiFontSize, appZoomPercent) {
  return {
    editorFontSize,
    uiFontSize,
    appZoomPercent: appZoomPercent ?? DEFAULT_APP_ZOOM_PERCENT,
  }
}

export function createWorkspacePreferenceState() {
  const editorFontSize = normalizeEditorFontSize(
    readNumber('editorFontSize', DEFAULT_EDITOR_FONT_SIZE)
  )
  const uiFontSize = readNumber('uiFontSize', DEFAULT_UI_FONT_SIZE)
  const storedAppZoomPercent = hasStoredValue(APP_ZOOM_KEY)
    ? normalizeAppZoomPercent(readNumber(APP_ZOOM_KEY, DEFAULT_APP_ZOOM_PERCENT))
    : null
  const zoomState = migrateLegacyFooterZoom(editorFontSize, uiFontSize, storedAppZoomPercent)
  const primarySurface = normalizeWorkbenchSurface(readString('primarySurface', 'workspace'))
  const storedLeftSidebarPanel = readEnum('leftSidebarPanel', ALL_WORKBENCH_SIDEBAR_PANELS, 'files')
  const leftSidebarPanel = normalizeWorkbenchSidebarPanel(primarySurface, storedLeftSidebarPanel)
  const storedRightSidebarPanel = readEnum(
    'rightSidebarPanel',
    ALL_WORKBENCH_INSPECTOR_PANELS,
    'outline'
  )
  const rightSidebarPanel = normalizeWorkbenchInspectorPanel(
    primarySurface,
    storedRightSidebarPanel
  )

  return {
    primarySurface,
    leftSidebarOpen: readBoolean('leftSidebarOpen', true),
    leftSidebarPanel,
    rightSidebarOpen: readTrueOnlyBoolean('rightSidebarOpen'),
    rightSidebarPanel,
    autoSave: readBoolean('autoSave', true),
    softWrap: readBoolean('softWrap', true),
    wrapColumn: readNumber('wrapColumn', 0),
    editorFontSize: zoomState.editorFontSize,
    uiFontSize: zoomState.uiFontSize,
    appZoomPercent: zoomState.appZoomPercent,
    proseFont: readString('proseFont', 'inter'),
    pdfThemedPages: hasStoredValue('pdfThemedPages')
      ? readTrueOnlyBoolean('pdfThemedPages')
      : true,
    theme: readWorkspaceThemePreference(),
  }
}

export function toggleStoredBoolean(currentValue, key) {
  const nextValue = !currentValue
  writeValue(key, nextValue)
  return nextValue
}

export function persistStoredString(key, value) {
  writeValue(key, value)
  return value
}

export function setWrapColumnPreference(value) {
  const nextValue = Math.max(0, parseInt(value, 10) || 0)
  writeValue('wrapColumn', nextValue)
  return nextValue
}

export function increaseWorkspaceZoom(currentPercent) {
  const normalized = normalizeAppZoomPercent(currentPercent)
  return (
    APP_ZOOM_PRESETS.find((preset) => preset > normalized) ||
    APP_ZOOM_PRESETS[APP_ZOOM_PRESETS.length - 1]
  )
}

export function decreaseWorkspaceZoom(currentPercent) {
  const normalized = normalizeAppZoomPercent(currentPercent)
  for (let idx = APP_ZOOM_PRESETS.length - 1; idx >= 0; idx -= 1) {
    if (APP_ZOOM_PRESETS[idx] < normalized) {
      return APP_ZOOM_PRESETS[idx]
    }
  }
  return APP_ZOOM_PRESETS[0]
}

export function resetWorkspaceZoom() {
  return DEFAULT_APP_ZOOM_PERCENT
}

export function setWorkspaceZoomPercent(percent) {
  const nextValue = normalizeAppZoomPercent(percent)
  writeValue(APP_ZOOM_KEY, nextValue)
  return nextValue
}

function _isAppleWebKitPlatform() {
  if (typeof navigator === 'undefined') return false
  const platform = String(navigator.platform || '').toLowerCase()
  const userAgent = String(navigator.userAgent || '').toLowerCase()
  return /(mac|iphone|ipad|ipod)/.test(platform) || /(mac os x|iphone|ipad|ipod)/.test(userAgent)
}

export async function applyWorkspaceAppZoom(percent) {
  const nextValue = normalizeAppZoomPercent(percent)
  writeValue(APP_ZOOM_KEY, nextValue)

  if (typeof document === 'undefined') return

  const root = document.documentElement
  root.style.removeProperty('zoom')

  const isTauriWebview =
    typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__?.metadata?.currentWebview
  if (isTauriWebview) {
    try {
      await getCurrentWebview().setZoom(1)
    } catch (error) {
      console.warn('[workspace] failed to reset native app zoom:', error)
    }
  }
}

export function applyWorkspaceFontSizes(editorFontSize, uiFontSize) {
  document.documentElement.style.setProperty(
    '--editor-font-size',
    `${normalizeEditorFontSize(editorFontSize)}px`
  )
  document.documentElement.style.setProperty('--ui-font-size', `${uiFontSize}px`)
  writeValue('editorFontSize', normalizeEditorFontSize(editorFontSize))
  writeValue('uiFontSize', uiFontSize)
}

export function setWorkspaceEditorFontSize(editorFontSize) {
  const nextValue = normalizeEditorFontSize(editorFontSize)
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--editor-font-size', `${nextValue}px`)
  }
  writeValue('editorFontSize', nextValue)
  return nextValue
}

export function setWorkspaceProseFont(name) {
  writeValue('proseFont', name)
  document.documentElement.style.setProperty(
    '--font-prose',
    PROSE_FONT_STACKS[name] || PROSE_FONT_STACKS.inter
  )
}

function resolveSystemTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark'
  }
  return window.matchMedia(SYSTEM_THEME_MEDIA).matches ? 'dark' : 'light'
}

function applyWorkspaceThemeClasses(theme) {
  if (typeof document === 'undefined') return

  const normalizedTheme = normalizeWorkspaceThemeId(theme)
  const resolvedTheme = normalizedTheme === 'system' ? resolveSystemTheme() : normalizedTheme

  const root = document.documentElement
  root.classList.remove(...THEME_CLASSES)
  root.classList.add(`theme-${resolvedTheme}`)
  if (normalizedTheme === 'system') {
    root.classList.add('theme-system')
  }
  root.dataset.themePreference = normalizedTheme
  root.dataset.themeResolved = resolvedTheme

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('workspace-theme-updated', {
      detail: {
        themePreference: normalizedTheme,
        resolvedTheme,
      },
    }))
  }
}

function detachSystemThemeListener() {
  if (typeof removeSystemThemeListener === 'function') {
    removeSystemThemeListener()
  }
  removeSystemThemeListener = null
  systemThemeQuery = null
}

function attachSystemThemeListener() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  if (systemThemeQuery) return

  systemThemeQuery = window.matchMedia(SYSTEM_THEME_MEDIA)
  const handleChange = () => {
    if (activeWorkspaceTheme === 'system') {
      applyWorkspaceThemeClasses('system')
    }
  }

  if (typeof systemThemeQuery.addEventListener === 'function') {
    systemThemeQuery.addEventListener('change', handleChange)
    removeSystemThemeListener = () => systemThemeQuery?.removeEventListener('change', handleChange)
    return
  }

  if (typeof systemThemeQuery.addListener === 'function') {
    systemThemeQuery.addListener(handleChange)
    removeSystemThemeListener = () => systemThemeQuery?.removeListener(handleChange)
  }
}

function syncSystemThemeListener(theme) {
  activeWorkspaceTheme = normalizeWorkspaceThemeId(theme)
  if (activeWorkspaceTheme === 'system') {
    attachSystemThemeListener()
    return
  }
  detachSystemThemeListener()
}

export function setWorkspaceTheme(name) {
  const nextTheme = normalizeWorkspaceThemeId(name)
  writeValue('theme', nextTheme)
  syncSystemThemeListener(nextTheme)
  applyWorkspaceThemeClasses(nextTheme)
  return nextTheme
}

export function restoreWorkspaceTheme(currentTheme) {
  const nextTheme = normalizeWorkspaceThemeId(currentTheme || 'system')
  writeValue('theme', nextTheme)
  syncSystemThemeListener(nextTheme)
  applyWorkspaceThemeClasses(nextTheme)
  return nextTheme
}
