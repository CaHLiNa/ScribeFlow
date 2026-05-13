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

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  globalThis.isTauri = true
  mockWindows('main')

  const calls = []
  const rustContract = {
    document: {
      defaultPage: 'rust-doc-default',
      pages: [
        {
          id: 'rust-doc-default',
          permanent: true,
          dynamic: false,
          closeable: false,
          fallbackPage: 'rust-file-fallback',
        },
        {
          id: 'rust-dynamic',
          permanent: false,
          dynamic: true,
          closeable: true,
          fallbackPage: 'rust-doc-default',
        },
        {
          id: '',
          permanent: true,
          dynamic: true,
          closeable: true,
          fallbackPage: 'preview',
        },
      ],
    },
    reference: {
      defaultPage: 'rust-ref-default',
      pages: [
        {
          id: 'rust-ref-default',
          permanent: true,
          dynamic: false,
          closeable: false,
          fallbackPage: 'rust-ref-default',
        },
      ],
    },
  }

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'workbench_dock_page_contract_load') {
      return rustContract
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    createWorkbenchDockPageContract,
    dockDefaultPageForSurface,
    dockPageDefinitionsForSurface,
    dockPageIdsForSurface,
    loadWorkbenchDockPageContract,
  } = await vite.ssrLoadModule('/src/services/workbenchDockPages.js')

  assert.deepEqual(createWorkbenchDockPageContract(), {
    document: { defaultPage: '', pages: [] },
    reference: { defaultPage: '', pages: [] },
  })

  const loaded = await loadWorkbenchDockPageContract()
  assert.equal(calls[0].cmd, 'workbench_dock_page_contract_load')
  assert.deepEqual(dockPageIdsForSurface(loaded, 'document'), [
    'rust-doc-default',
    'rust-dynamic',
  ])
  assert.equal(dockDefaultPageForSurface(loaded, 'document'), 'rust-doc-default')
  assert.equal(dockDefaultPageForSurface(loaded, 'reference'), 'rust-ref-default')
  assert.equal(dockPageDefinitionsForSurface(loaded, 'document')[0].fallbackPage, 'rust-file-fallback')
  assert.equal(dockPageIdsForSurface(loaded, 'document').includes('preview'), false)

  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.js')
  const pinia = createPinia()
  const workspace = useWorkspaceStore(pinia)

  assert.deepEqual(workspace.documentDockPageIds, [])
  await workspace.hydrateDockPageContract()
  assert.equal(calls[1].cmd, 'workbench_dock_page_contract_load')
  assert.deepEqual(workspace.documentDockPageIds, ['rust-doc-default', 'rust-dynamic'])
  assert.equal(workspace.documentDockDefaultPage, 'rust-doc-default')
  assert.equal(workspace.referenceDockDefaultPage, 'rust-ref-default')

  console.log('workbench dock page rust normalization probe passed')
} finally {
  delete globalThis.isTauri
  clearTauriMocks()
  await vite.close()
}
