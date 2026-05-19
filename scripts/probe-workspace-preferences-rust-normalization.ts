import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { createPinia } from 'pinia'
import { createLogger, createServer } from 'vite'

if (!globalThis.window) {
  globalThis.window = globalThis
}

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto
}

if (!globalThis.CustomEvent) {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type
      this.detail = init.detail
    }
  }
}

if (typeof globalThis.dispatchEvent !== 'function') {
  globalThis.dispatchEvent = () => true
}

if (!globalThis.document) {
  const classNames = new Set()
  globalThis.document = {
    documentElement: {
      dataset: {},
      classList: {
        add: (...names) => names.forEach((name) => classNames.add(name)),
        remove: (...names) => names.forEach((name) => classNames.delete(name)),
        contains: (name) => classNames.has(name),
      },
    },
  }
}

const vite = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  logLevel: 'error',
  customLogger: createLogger('error', {
    customConsole: {
      ...console,
      error(message, ...rest) {
        const rendered = String(message || '')
        if (rendered.includes('WebSocket server error:')) return
        console.error(message, ...rest)
      },
    },
  }),
})

let clearTauriMocks = () => {}

function normalizePreferencePayload(preferences = {}) {
  const documentDockOpen = preferences.documentDockOpen === true ||
    (
      preferences.rightSidebarOpen === true &&
      preferences.referenceDockOpen !== true &&
      String(preferences.leftSidebarPanel || '') !== 'references'
    )
  const referenceDockOpen = preferences.referenceDockOpen === true ||
    (
      preferences.rightSidebarOpen === true &&
      preferences.documentDockOpen !== true &&
      String(preferences.leftSidebarPanel || '') === 'references'
    )

  return {
    ...preferences,
    documentDockOpen,
    referenceDockOpen,
    rightSidebarOpen: documentDockOpen || referenceDockOpen,
    editorFontSize: Math.min(20, Math.max(12, Math.round(Number(preferences.editorFontSize) || 14))),
    fileTreeSortMode: String(preferences.fileTreeSortMode || '').trim().toLowerCase() === 'modified'
      ? 'modified'
      : 'name',
    pdfViewerZoomMode: ['page-fit', 'remember-last'].includes(
      String(preferences.pdfViewerZoomMode || '').trim().toLowerCase(),
    )
      ? String(preferences.pdfViewerZoomMode || '').trim().toLowerCase()
      : 'page-width',
    pdfViewerSpreadMode: String(preferences.pdfViewerSpreadMode || '').trim().toLowerCase() === 'double'
      ? 'double'
      : 'single',
    pdfViewerLastScale: '2',
    pdfViewerPageThemeMode: String(preferences.pdfViewerPageThemeMode || '').trim().toLowerCase() === 'light'
      ? 'light'
      : 'theme',
    theme: String(preferences.theme || '').trim().toLowerCase() === 'monokai'
      ? 'dark'
      : ['system', 'light', 'dark'].includes(String(preferences.theme || '').trim().toLowerCase())
        ? String(preferences.theme || '').trim().toLowerCase()
        : 'system',
  }
}

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'workspace_preferences_normalize') {
      return normalizePreferencePayload(args?.params?.preferences || {})
    }

    if (cmd === 'workspace_preferences_load') {
      return {}
    }

    if (cmd === 'workspace_preferences_save') {
      return args?.params?.preferences || {}
    }

    if (cmd === 'workspace_preferences_list_system_fonts') {
      return [' Rust Font ', '', 'LastResort']
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.ts')
  const workspace = useWorkspaceStore(createPinia())
  workspace.globalConfigDir = '/tmp/scribeflow-global-config'
  workspace.ensureGlobalConfigDir = async () => '/tmp/scribeflow-global-config'

  const {
    loadWorkspaceSystemFontFamilies,
    loadWorkspacePreferences,
    saveWorkspacePreferences,
  } = await vite.ssrLoadModule('/src/services/workspacePreferences.ts')

  await loadWorkspacePreferences(42)
  await saveWorkspacePreferences(42, { editorFontSize: 16 })
  const fonts = await loadWorkspaceSystemFontFamilies()

  await workspace.persistWorkspacePreferencesPatch({
    editorFontSize: 50,
    fileTreeSortMode: 'recent',
    pdfViewerZoomMode: 'weird',
    pdfViewerSpreadMode: 'spread',
    pdfViewerLastScale: '4.25',
    pdfViewerPageThemeMode: 'custom',
    theme: 'monokai',
  })

  assert.equal(workspace.editorFontSize, 20)
  assert.equal(workspace.fileTreeSortMode, 'name')
  assert.equal(workspace.pdfViewerZoomMode, 'page-width')
  assert.equal(workspace.pdfViewerSpreadMode, 'single')
  assert.equal(workspace.pdfViewerLastScale, '2')
  assert.equal(workspace.pdfViewerPageThemeMode, 'theme')
  assert.equal(workspace.theme, 'dark')

  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'workspace_preferences_load',
      'workspace_preferences_save',
      'workspace_preferences_list_system_fonts',
      'workspace_preferences_normalize',
      'workspace_preferences_save',
    ],
  )
  assert.deepEqual(calls[0].args.params, { globalConfigDir: 42 })
  assert.deepEqual(calls[1].args.params, {
    globalConfigDir: 42,
    preferences: { editorFontSize: 16 },
  })
  assert.deepEqual(fonts, [' Rust Font ', '', 'LastResort'])
  assert.equal(calls[4].args.params.preferences.editorFontSize, 20)
  assert.equal(calls[4].args.params.preferences.pdfViewerZoomMode, 'page-width')
  assert.equal(calls[4].args.params.preferences.pdfViewerLastScale, '2')
  assert.equal(calls[4].args.params.preferences.theme, 'dark')

  workspace.restoreTheme()
  assert.equal(workspace.theme, 'dark')
  assert.equal(document.documentElement.dataset.themePreference, 'dark')
  assert.equal(document.documentElement.classList.contains('theme-dark'), true)
  assert.equal(document.documentElement.classList.contains('theme-monokai'), false)

  workspace.documentDockOpen = false
  workspace.referenceDockOpen = false
  workspace.rightSidebarOpen = false
  workspace.leftSidebarPanel = 'references'

  await workspace.persistWorkspacePreferencesPatch({
    rightSidebarOpen: true,
  })

  assert.equal(workspace.documentDockOpen, false)
  assert.equal(workspace.referenceDockOpen, true)
  assert.equal(workspace.rightSidebarOpen, true)
  assert.equal(calls[6].args.params.preferences.referenceDockOpen, true)
  assert.equal(calls[6].args.params.preferences.rightSidebarOpen, true)

  console.log('workspace preferences rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
