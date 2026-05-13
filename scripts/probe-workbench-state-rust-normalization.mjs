import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
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

function stringField(payload, key, fallback) {
  return typeof payload?.[key] === 'string' ? payload[key] : fallback
}

function boolField(payload, key, fallback) {
  return typeof payload?.[key] === 'boolean' ? payload[key] : fallback
}

function normalizeDocumentDockPage(value = '') {
  const normalized = String(value || '').trim()
  if (normalized.startsWith('extension:') && normalized.length > 'extension:'.length) {
    return normalized
  }
  return ['file', 'problems', 'references'].includes(normalized) ? normalized : 'preview'
}

function normalizeReferenceDockPage(value = '') {
  const normalized = String(value || '').trim()
  return ['pdf', 'cited-in'].includes(normalized) ? normalized : 'details'
}

function normalizeWorkbenchPayload(payload = {}) {
  payload = payload && typeof payload === 'object' ? payload : {}
  const sourceSurface = stringField(payload, 'primarySurface', 'workspace')
  const leftSidebarPanel = stringField(payload, 'leftSidebarPanel', 'files').trim()
  const normalizedLeftSidebarPanel = ['files', 'references'].includes(leftSidebarPanel)
    ? leftSidebarPanel
    : 'files'
  const documentDockOpen = boolField(payload, 'documentDockOpen', false)
  const referenceDockOpen = boolField(payload, 'referenceDockOpen', false)
  const rightSidebarOpen = boolField(payload, 'rightSidebarOpen', false)
  const normalizedDockOpen = (() => {
    if (
      sourceSurface.toLowerCase() === 'settings' ||
      documentDockOpen ||
      referenceDockOpen ||
      !rightSidebarOpen
    ) {
      return { documentDockOpen, referenceDockOpen }
    }
    return normalizedLeftSidebarPanel === 'references'
      ? { documentDockOpen: false, referenceDockOpen: true }
      : { documentDockOpen: true, referenceDockOpen: false }
  })()

  return {
    primarySurface: 'workspace',
    leftSidebarOpen: boolField(payload, 'leftSidebarOpen', true),
    leftSidebarPanel: normalizedLeftSidebarPanel,
    rightSidebarOpen: normalizedDockOpen.documentDockOpen || normalizedDockOpen.referenceDockOpen,
    rightSidebarPanel: stringField(payload, 'rightSidebarPanel', 'dock').trim() === 'dock'
      ? 'dock'
      : 'dock',
    documentDockOpen: normalizedDockOpen.documentDockOpen,
    referenceDockOpen: normalizedDockOpen.referenceDockOpen,
    documentDockActivePage: normalizeDocumentDockPage(payload.documentDockActivePage),
    referenceDockActivePage: normalizeReferenceDockPage(payload.referenceDockActivePage),
  }
}

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'workbench_state_normalize') {
      return normalizeWorkbenchPayload(args?.params)
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { normalizeWorkbenchState } = await vite.ssrLoadModule('/src/services/workspacePreferences.js')

  const rawState = {
    primarySurface: 'settings',
    leftSidebarOpen: 'not-a-bool',
    leftSidebarPanel: 'references',
    rightSidebarOpen: 'legacy-open',
    rightSidebarPanel: 'outline',
    documentDockOpen: 'yes',
    referenceDockOpen: null,
    documentDockActivePage: 'extension:example.tools',
    referenceDockActivePage: 'missing',
  }

  const normalized = await normalizeWorkbenchState(rawState)
  const invalidNormalized = await normalizeWorkbenchState(false)

  assert.deepEqual(calls.map((call) => call.cmd), [
    'workbench_state_normalize',
    'workbench_state_normalize',
  ])
  assert.deepEqual(calls[0].args.params, rawState)
  assert.equal(calls[1].args.params, false)
  assert.deepEqual(normalized, {
    primarySurface: 'workspace',
    leftSidebarOpen: true,
    leftSidebarPanel: 'references',
    rightSidebarOpen: false,
    rightSidebarPanel: 'dock',
    documentDockOpen: false,
    referenceDockOpen: false,
    documentDockActivePage: 'extension:example.tools',
    referenceDockActivePage: 'details',
  })
  assert.deepEqual(invalidNormalized, {
    primarySurface: 'workspace',
    leftSidebarOpen: true,
    leftSidebarPanel: 'files',
    rightSidebarOpen: false,
    rightSidebarPanel: 'dock',
    documentDockOpen: false,
    referenceDockOpen: false,
    documentDockActivePage: 'preview',
    referenceDockActivePage: 'details',
  })

  console.log('workbench state rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
