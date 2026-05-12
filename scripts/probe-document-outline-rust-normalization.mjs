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

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'document_outline_resolve') {
      return []
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { resolveDocumentOutlineItems } = await vite.ssrLoadModule(
    '/src/services/documentOutline/runtime.js',
  )

  await resolveDocumentOutlineItems(' /tmp/workspace/main.md ', {
    content: '  # Title keeps spaces  ',
    workspacePath: false,
    flatFiles: [
      ' /tmp/workspace/main.md ',
      { path: ' /tmp/workspace/chapter.tex ' },
    ],
    filesStore: {
      lastWorkspaceSnapshot: {
        flatFiles: [' /tmp/workspace/snapshot.md '],
      },
      flatFiles: [' /tmp/workspace/cached.md '],
    },
    contentOverrides: {
      ' /tmp/workspace/main.md ': '  override keeps spaces  ',
    },
  })

  await resolveDocumentOutlineItems(42, {
    content: 17,
    workspacePath: ' /tmp/workspace ',
    flatFiles: false,
    filesStore: {
      lastWorkspaceSnapshot: {
        flatFiles: [
          { path: ' /tmp/workspace/snapshot.tex ' },
        ],
      },
      flatFiles: [
        ' /tmp/workspace/cached.tex ',
      ],
    },
    contentOverrides: false,
  })

  assert.deepEqual(calls.map((call) => call.cmd), [
    'document_outline_resolve',
    'document_outline_resolve',
  ])
  assert.deepEqual(calls[0].args.params, {
    filePath: ' /tmp/workspace/main.md ',
    content: '  # Title keeps spaces  ',
    workspacePath: false,
    flatFiles: [
      ' /tmp/workspace/main.md ',
      { path: ' /tmp/workspace/chapter.tex ' },
    ],
    snapshotFlatFiles: [' /tmp/workspace/snapshot.md '],
    cachedFlatFiles: [' /tmp/workspace/cached.md '],
    contentOverrides: {
      ' /tmp/workspace/main.md ': '  override keeps spaces  ',
    },
  })
  assert.deepEqual(calls[1].args.params, {
    filePath: 42,
    content: 17,
    workspacePath: ' /tmp/workspace ',
    flatFiles: false,
    snapshotFlatFiles: [
      { path: ' /tmp/workspace/snapshot.tex ' },
    ],
    cachedFlatFiles: [
      ' /tmp/workspace/cached.tex ',
    ],
    contentOverrides: false,
  })

  console.log('document outline rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
