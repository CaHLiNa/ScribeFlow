import {
  normalizeEditorFontSize,
  normalizeWorkspaceThemePreference,
  normalizeWorkspaceUiFontSize,
  resolveWorkspaceFontCssValue,
} from './workspacePreferencesState.js'

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
const SYSTEM_THEME_MEDIA = '(prefers-color-scheme: dark)'

let activeWorkspaceTheme = 'system'
let systemThemeQuery = null
let removeSystemThemeListener = null

function resolveSystemTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark'
  }
  return window.matchMedia(SYSTEM_THEME_MEDIA).matches ? 'dark' : 'light'
}

function applyWorkspaceThemeClasses(theme) {
  if (typeof document === 'undefined') return

  const normalizedTheme = normalizeWorkspaceThemePreference(theme)
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
    window.dispatchEvent(
      new CustomEvent('workspace-theme-updated', {
        detail: {
          themePreference: normalizedTheme,
          resolvedTheme,
        },
      })
    )
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
  activeWorkspaceTheme = normalizeWorkspaceThemePreference(theme)
  if (activeWorkspaceTheme === 'system') {
    attachSystemThemeListener()
    return
  }
  detachSystemThemeListener()
}

function applyWorkspaceFontVariable(cssVariable, name, fallback = 'inter') {
  const { font, cssValue } = resolveWorkspaceFontCssValue(name, fallback)
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty(cssVariable, cssValue)
  }
  return font
}

export function applyWorkspaceFontSizes(editorFontSize, uiFontSize) {
  if (typeof document === 'undefined') return

  document.documentElement.style.setProperty(
    '--editor-font-size',
    `${normalizeEditorFontSize(editorFontSize)}px`
  )
  document.documentElement.style.setProperty(
    '--ui-font-size',
    `${normalizeWorkspaceUiFontSize(uiFontSize)}px`
  )
}

export function setWorkspaceEditorFontSize(editorFontSize) {
  const nextValue = normalizeEditorFontSize(editorFontSize)
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--editor-font-size', `${nextValue}px`)
  }
  return nextValue
}

export function setWorkspaceUiFont(name) {
  return applyWorkspaceFontVariable('--font-ui', name, 'inter')
}

export function setWorkspaceMarkdownFont(name) {
  return applyWorkspaceFontVariable('--font-markdown', name, 'inter')
}

export function setWorkspaceLatexFont(name) {
  return applyWorkspaceFontVariable('--font-latex', name, 'mono')
}

export function setWorkspaceTheme(name) {
  const nextTheme = normalizeWorkspaceThemePreference(name)
  syncSystemThemeListener(nextTheme)
  applyWorkspaceThemeClasses(nextTheme)
  return nextTheme
}

export function restoreWorkspaceTheme(currentTheme) {
  return setWorkspaceTheme(currentTheme || 'system')
}
