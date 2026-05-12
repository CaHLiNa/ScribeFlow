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

    if (cmd === 'workspace_preferences_save') {
      return args?.params?.preferences || {}
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.js')
  const workspace = useWorkspaceStore(createPinia())
  workspace.globalConfigDir = '/tmp/scribeflow-global-config'
  workspace.ensureGlobalConfigDir = async () => '/tmp/scribeflow-global-config'

  await workspace.persistWorkspacePreferencesPatch({
    editorFontSize: 50,
    fileTreeSortMode: 'recent',
    pdfViewerZoomMode: 'weird',
    pdfViewerSpreadMode: 'spread',
    pdfViewerLastScale: '4.25',
    pdfViewerPageThemeMode: 'custom',
  })

  assert.equal(workspace.editorFontSize, 20)
  assert.equal(workspace.fileTreeSortMode, 'name')
  assert.equal(workspace.pdfViewerZoomMode, 'page-width')
  assert.equal(workspace.pdfViewerSpreadMode, 'single')
  assert.equal(workspace.pdfViewerLastScale, '2')
  assert.equal(workspace.pdfViewerPageThemeMode, 'theme')

  assert.deepEqual(
    calls.map((call) => call.cmd),
    ['workspace_preferences_normalize', 'workspace_preferences_save'],
  )
  assert.equal(calls[1].args.params.preferences.editorFontSize, 20)
  assert.equal(calls[1].args.params.preferences.pdfViewerZoomMode, 'page-width')
  assert.equal(calls[1].args.params.preferences.pdfViewerLastScale, '2')

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
  assert.equal(calls[3].args.params.preferences.referenceDockOpen, true)
  assert.equal(calls[3].args.params.preferences.rightSidebarOpen, true)

  console.log('workspace preferences rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
