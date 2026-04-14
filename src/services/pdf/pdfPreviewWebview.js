import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi'
import { Webview } from '@tauri-apps/api/webview'
import { getCurrentWindow } from '@tauri-apps/api/window'

const webviewStateByLabel = new Map()
const ENABLE_PDF_HOSTED_PREVIEW = false

export const PDF_PREVIEW_HOST_READY_EVENT = 'altals:pdf-host:ready'
export const PDF_PREVIEW_HOST_UPDATE_EVENT = 'altals:pdf-host:update'
export const PDF_PREVIEW_HOST_BACKWARD_SYNC_EVENT = 'altals:pdf-host:backward-sync'
export const PDF_PREVIEW_HOST_FORWARD_SYNC_HANDLED_EVENT = 'altals:pdf-host:forward-sync-handled'

export const PDF_PREVIEW_THEME_TOKEN_NAMES = [
  '--surface-base',
  '--surface-raised',
  '--surface-hover',
  '--border-subtle',
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--shell-preview-surface',
  '--shell-editor-surface',
  '--workspace-ink',
  '--focus-ring',
  '--error',
]

function sanitizeLabelPart(value = '') {
  return (
    String(value || '')
      .trim()
      .replace(/[^A-Za-z0-9_:/-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'preview'
  )
}

function normalizeResolvedTheme(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase() === 'light'
    ? 'light'
    : 'dark'
}

function hasPdfChildWebviewRuntime() {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__?.metadata?.currentWebview
}

export function isPdfHostedPreviewSupported() {
  // Child webviews clip transient overlays at native bounds, which breaks workbench menus.
  // Keep the hosted path disabled until there is a dedicated cross-webview overlay bridge.
  return ENABLE_PDF_HOSTED_PREVIEW && hasPdfChildWebviewRuntime()
}

export function buildPdfPreviewWebviewLabel(paneId = '') {
  return `pdf-preview-${sanitizeLabelPart(paneId)}`
}

export function buildPdfPreviewHostUrl(options = {}) {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost'
  const url = new URL('/pdf-host.html', origin)
  const label = String(options.label || '').trim()
  const parentLabel = String(options.parentLabel || '').trim()
  const resolvedTheme = normalizeResolvedTheme(options.resolvedTheme)
  const themeRevision = Number.isFinite(Number(options.themeRevision))
    ? Number(options.themeRevision)
    : 0
  const bootBackground = String(options.bootBackground || '').trim()
  const bootForeground = String(options.bootForeground || '').trim()
  if (label) {
    url.searchParams.set('label', label)
  }
  if (parentLabel) {
    url.searchParams.set('parentLabel', parentLabel)
  }
  url.searchParams.set('resolvedTheme', resolvedTheme)
  url.searchParams.set('themeRevision', String(themeRevision))
  if (bootBackground) {
    url.searchParams.set('bootBackground', bootBackground)
  }
  if (bootForeground) {
    url.searchParams.set('bootForeground', bootForeground)
  }
  return url.toString()
}

export function capturePdfPreviewThemeTokens() {
  if (typeof document === 'undefined') return {}
  const source = getComputedStyle(document.documentElement)
  const tokens = {}
  for (const name of PDF_PREVIEW_THEME_TOKEN_NAMES) {
    const value = String(source.getPropertyValue(name) || '').trim()
    if (value) {
      tokens[name] = value
    }
  }
  return tokens
}

export function createPdfPreviewHostPayload(options = {}) {
  const compileState =
    options.compileState && typeof options.compileState === 'object'
      ? {
          lastCompiled: options.compileState.lastCompiled ?? '',
          pdfPath: String(options.compileState.pdfPath || ''),
          synctexPath: String(options.compileState.synctexPath || ''),
          compileTargetPath: String(options.compileState.compileTargetPath || ''),
        }
      : null

  return {
    label: String(options.label || '').trim(),
    sourcePath: String(options.sourcePath || '').trim(),
    artifactPath: String(options.artifactPath || '').trim(),
    kind: String(options.kind || 'pdf'),
    workspacePath: String(options.workspacePath || '').trim(),
    documentVersion: options.documentVersion ?? '',
    compileState,
    forwardSyncRequest: options.forwardSyncRequest || null,
    resolvedTheme: normalizeResolvedTheme(options.resolvedTheme),
    pdfThemedPages: options.pdfThemedPages === true,
    themeRevision: Number.isFinite(Number(options.themeRevision))
      ? Number(options.themeRevision)
      : 0,
    themeTokens: {
      ...(options.themeTokens || {}),
    },
  }
}

async function closeExistingWebview(label) {
  const existing = await Webview.getByLabel(label).catch(() => null)
  if (!existing) return
  await existing.close().catch(() => {})
}

async function getExistingWebview(label) {
  return Webview.getByLabel(label).catch(() => null)
}

async function createWebview(label, url, bounds) {
  const appWindow = getCurrentWindow()
  const webview = new Webview(appWindow, label, {
    url,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    focus: true,
    acceptFirstMouse: true,
    devtools: import.meta.env.DEV,
  })

  await new Promise((resolve, reject) => {
    const cleanup = []
    const done = (fn, value) => {
      while (cleanup.length) cleanup.pop()?.()
      fn(value)
    }

    webview
      .once('tauri://created', () => done(resolve))
      .then((unlisten) => cleanup.push(unlisten))
      .catch(() => {})
    webview
      .once('tauri://error', (event) => {
        done(reject, new Error(String(event?.payload || 'Failed to create PDF preview webview')))
      })
      .then((unlisten) => cleanup.push(unlisten))
      .catch(() => {})
  })

  await webview.setAutoResize(false).catch(() => {})
  return webview
}

function isMissingWebviewError(error) {
  return /webview not found/i.test(String(error?.message || error || ''))
}

export async function ensurePdfPreviewWebview(options = {}) {
  const label = String(options.label || '')
  const url = String(options.url || '')
  const bounds = options.bounds || null
  if (!label || !url || !bounds) return null

  const cached = webviewStateByLabel.get(label) || null
  let webview = cached?.webview || (await getExistingWebview(label))

  if (webview && cached?.url !== url) {
    await closeExistingWebview(label)
    webviewStateByLabel.delete(label)
    webview = null
  }

  const createdFresh = !webview
  if (!webview) {
    try {
      webview = await createWebview(label, url, bounds)
    } catch (error) {
      if (/already exists/i.test(String(error?.message || error || ''))) {
        webview = await getExistingWebview(label)
      } else {
        throw error
      }
    }
  }

  if (!webview) {
    throw new Error(`Failed to acquire PDF preview webview: ${label}`)
  }

  if (!createdFresh) {
    const previousBounds = cached?.bounds || {}
    try {
      if (previousBounds.x !== bounds.x || previousBounds.y !== bounds.y) {
        await webview.setPosition(new LogicalPosition(bounds.x, bounds.y))
      }
      if (previousBounds.width !== bounds.width || previousBounds.height !== bounds.height) {
        await webview.setSize(new LogicalSize(bounds.width, bounds.height))
      }
      if (cached?.visible !== true) {
        await webview.show()
      }
    } catch (error) {
      if (isMissingWebviewError(error)) {
        webviewStateByLabel.delete(label)
        await closeExistingWebview(label)
        return ensurePdfPreviewWebview(options)
      }
      throw error
    }
  }

  webviewStateByLabel.set(label, {
    webview,
    url,
    bounds,
    visible: true,
  })

  return webview
}

export async function syncPdfPreviewWebviewBounds(label, bounds) {
  const state = webviewStateByLabel.get(String(label || '')) || null
  if (!state?.webview || !bounds) return false

  const previous = state.bounds || {}
  try {
    if (previous.x !== bounds.x || previous.y !== bounds.y) {
      await state.webview.setPosition(new LogicalPosition(bounds.x, bounds.y))
    }
    if (previous.width !== bounds.width || previous.height !== bounds.height) {
      await state.webview.setSize(new LogicalSize(bounds.width, bounds.height))
    }
    state.bounds = bounds
    if (state.visible !== true) {
      await state.webview.show().catch(() => {})
      state.visible = true
    }
    return true
  } catch (error) {
    if (isMissingWebviewError(error)) {
      webviewStateByLabel.delete(String(label || ''))
      return false
    }
    throw error
  }
}

export async function hidePdfPreviewWebview(label) {
  const state = webviewStateByLabel.get(String(label || '')) || null
  if (!state?.webview) return false
  if (state.visible === false) return true
  try {
    await state.webview.hide().catch(() => {})
  } catch (error) {
    if (isMissingWebviewError(error)) {
      webviewStateByLabel.delete(String(label || ''))
      return false
    }
    throw error
  }
  state.visible = false
  return true
}

export async function destroyPdfPreviewWebview(label) {
  const normalizedLabel = String(label || '')
  if (!normalizedLabel) return false
  webviewStateByLabel.delete(normalizedLabel)
  await closeExistingWebview(normalizedLabel)
  return true
}
