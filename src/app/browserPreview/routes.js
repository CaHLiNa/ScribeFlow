export const BROWSER_PREVIEW_BASE_PATH = '/preview'
export const BROWSER_PREVIEW_DEFAULT_PATH = `${BROWSER_PREVIEW_BASE_PATH}/workspace/document`

export const BROWSER_PREVIEW_SETTINGS_SECTIONS = Object.freeze([
  'theme',
  'editor',
  'agent',
  'zotero',
  'system',
  'updates',
])

export function isTauriDesktopRuntime() {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

export function isBrowserPreviewRuntime() {
  return typeof window !== 'undefined' && !isTauriDesktopRuntime()
}

function normalizePathname(pathname = '') {
  const normalized = `/${String(pathname || '').trim()}`.replace(/\/+/g, '/')
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized
}

function normalizeSettingsSection(section = '') {
  const normalized = String(section || '').trim().toLowerCase()
  return BROWSER_PREVIEW_SETTINGS_SECTIONS.includes(normalized) ? normalized : 'theme'
}

export function parseBrowserPreviewPath(pathname = '') {
  const normalizedPathname = normalizePathname(pathname)
  const parts = normalizedPathname.split('/').filter(Boolean)

  if (normalizedPathname === '/' || parts[0] !== 'preview') {
    return {
      surface: 'workspace',
      variant: 'document',
      normalizedPathname: BROWSER_PREVIEW_DEFAULT_PATH,
    }
  }

  const surface = parts[1] || 'workspace'
  if (surface === 'launcher') {
    return {
      surface: 'launcher',
      normalizedPathname: `${BROWSER_PREVIEW_BASE_PATH}/launcher`,
    }
  }

  if (surface === 'references') {
    return {
      surface: 'references',
      normalizedPathname: `${BROWSER_PREVIEW_BASE_PATH}/references`,
    }
  }

  if (surface === 'settings') {
    const section = normalizeSettingsSection(parts[2] || 'theme')
    return {
      surface: 'settings',
      section,
      normalizedPathname: `${BROWSER_PREVIEW_BASE_PATH}/settings/${section}`,
    }
  }

  const variant = parts[2] === 'document' ? 'document' : 'newtab'
  return {
    surface: 'workspace',
    variant,
    normalizedPathname:
      variant === 'document'
        ? `${BROWSER_PREVIEW_BASE_PATH}/workspace/document`
        : `${BROWSER_PREVIEW_BASE_PATH}/workspace`,
  }
}

export function buildBrowserPreviewPath(route = {}) {
  if (route.surface === 'launcher') {
    return `${BROWSER_PREVIEW_BASE_PATH}/launcher`
  }

  if (route.surface === 'references') {
    return `${BROWSER_PREVIEW_BASE_PATH}/references`
  }

  if (route.surface === 'settings') {
    return `${BROWSER_PREVIEW_BASE_PATH}/settings/${normalizeSettingsSection(route.section)}`
  }

  return route.variant === 'document'
    ? `${BROWSER_PREVIEW_BASE_PATH}/workspace/document`
    : `${BROWSER_PREVIEW_BASE_PATH}/workspace`
}

export function syncBrowserPreviewHistory(route = {}, mode = 'replace') {
  if (!isBrowserPreviewRuntime()) return
  const nextPath = buildBrowserPreviewPath(route)
  if (window.location.pathname === nextPath) return
  const method = mode === 'push' ? 'pushState' : 'replaceState'
  window.history[method]({ preview: true }, '', nextPath)
}
