import { getCurrentWebview } from '@tauri-apps/api/webview'

const THEME_CLASSES = [
  'theme-light',
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
const DEFAULT_APP_ZOOM_PERCENT = 100
const APP_ZOOM_KEY = 'appZoomPercent'

export const APP_ZOOM_PRESETS = [100]

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

function nearestAppZoomPreset(value) {
  const normalized = normalizeAppZoomPercent(value)
  return APP_ZOOM_PRESETS.reduce((closest, preset) => (
    Math.abs(preset - normalized) < Math.abs(closest - normalized) ? preset : closest
  ), APP_ZOOM_PRESETS[0])
}

function migrateLegacyFooterZoom(editorFontSize, uiFontSize, appZoomPercent) {
  return {
    editorFontSize,
    uiFontSize,
    appZoomPercent: appZoomPercent ?? DEFAULT_APP_ZOOM_PERCENT,
  }
}

export function createWorkspacePreferenceState() {
  const editorFontSize = readNumber('editorFontSize', DEFAULT_EDITOR_FONT_SIZE)
  const uiFontSize = readNumber('uiFontSize', DEFAULT_UI_FONT_SIZE)
  const storedAppZoomPercent = hasStoredValue(APP_ZOOM_KEY)
    ? normalizeAppZoomPercent(readNumber(APP_ZOOM_KEY, DEFAULT_APP_ZOOM_PERCENT))
    : null
  const zoomState = migrateLegacyFooterZoom(editorFontSize, uiFontSize, storedAppZoomPercent)

  return {
    primarySurface: readString('primarySurface', 'workspace'),
    leftSidebarOpen: readBoolean('leftSidebarOpen', true),
    leftSidebarPanel: readEnum('leftSidebarPanel', ['files', 'references', 'outline'], 'files'),
    rightSidebarOpen: readTrueOnlyBoolean('rightSidebarOpen'),
    bottomPanelOpen: readTrueOnlyBoolean('bottomPanelOpen'),
    autoSave: readBoolean('autoSave', true),
    selectedModelId: readString('lastModelId'),
    ghostModelId: readString('ghostModelId'),
    ghostEnabled: readBoolean('ghostEnabled', true),
    livePreviewEnabled: readBoolean('livePreviewEnabled', true),
    softWrap: readBoolean('softWrap', true),
    wrapColumn: readNumber('wrapColumn', 0),
    spellcheck: readBoolean('spellcheck', true),
    editorFontSize: zoomState.editorFontSize,
    uiFontSize: zoomState.uiFontSize,
    appZoomPercent: zoomState.appZoomPercent,
    proseFont: readString('proseFont', 'inter'),
    pdfThemedPages: readTrueOnlyBoolean('pdfThemedPages'),
    theme: readString('theme', 'default'),
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
  return APP_ZOOM_PRESETS.find(preset => preset > normalized) || APP_ZOOM_PRESETS[APP_ZOOM_PRESETS.length - 1]
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

function isAppleWebKitPlatform() {
  if (typeof navigator === 'undefined') return false
  const platform = String(navigator.platform || '').toLowerCase()
  const userAgent = String(navigator.userAgent || '').toLowerCase()
  return /(mac|iphone|ipad|ipod)/.test(platform)
    || /(mac os x|iphone|ipad|ipod)/.test(userAgent)
}

export async function applyWorkspaceAppZoom(percent) {
  const nextValue = normalizeAppZoomPercent(percent)
  writeValue(APP_ZOOM_KEY, nextValue)

  if (typeof document === 'undefined') return

  const root = document.documentElement
  root.style.removeProperty('zoom')

  const isTauriWebview = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__?.metadata?.currentWebview
  if (isTauriWebview) {
    try {
      await getCurrentWebview().setZoom(1)
    } catch (error) {
      console.warn('[workspace] failed to reset native app zoom:', error)
    }
  }
}

export function applyWorkspaceFontSizes(editorFontSize, uiFontSize) {
  document.documentElement.style.setProperty('--editor-font-size', `${editorFontSize}px`)
  document.documentElement.style.setProperty('--ui-font-size', `${uiFontSize}px`)
  writeValue('editorFontSize', editorFontSize)
  writeValue('uiFontSize', uiFontSize)
}

export function setWorkspaceProseFont(name) {
  writeValue('proseFont', name)
  document.documentElement.style.setProperty('--font-prose', PROSE_FONT_STACKS[name] || PROSE_FONT_STACKS.inter)
}

export function setWorkspaceTheme(name) {
  writeValue('theme', name)
  const root = document.documentElement
  root.classList.remove(...THEME_CLASSES)
  if (name !== 'default') {
    root.classList.add(`theme-${name}`)
  }
}

export function restoreWorkspaceTheme(currentTheme) {
  const savedTheme = readString('theme')
  if (!savedTheme) {
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    return prefersDark ? 'monokai' : 'humane'
  }

  if (currentTheme !== 'default') {
    document.documentElement.classList.add(`theme-${currentTheme}`)
  }
  return null
}
