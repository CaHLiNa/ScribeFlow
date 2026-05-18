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
    calls.push([cmd, args])
    if (cmd === 'references_citation_render') {
      assert.equal(args?.params?.style, 'IEEE')
      assert.equal(args?.params?.workspacePath, ' /tmp/workspace ')
      return '[1]'
    }
    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    formatCitation,
    formatReferenceCitationById,
  } = await vite.ssrLoadModule('/src/services/references/citationFormatter.js')
  const rendered = await formatReferenceCitationById(
    'IEEE',
    'inline',
    [
      { id: 'ref-1', citationKey: 'demo2026', title: 'Demo' },
      { id: 'ref-2', citationKey: 'target2026', title: 'Target' },
    ],
    ' ref-2 ',
    1,
    ' /tmp/workspace ',
  )
  const legacyRendered = await formatCitation(
    'IEEE',
    'inline',
    { id: 'ref-1', citationKey: 'demo2026', title: 'Demo' },
    1,
    ' /tmp/workspace ',
  )

  assert.equal(rendered, '[1]')
  assert.equal(legacyRendered, '[1]')
  assert.deepEqual(calls.map(([cmd]) => cmd), [
    'references_citation_render',
    'references_citation_render',
  ])
  assert.equal(calls[0]?.[1]?.params?.referenceId, ' ref-2 ')
  assert.deepEqual(calls[0]?.[1]?.params?.reference, null)
  assert.deepEqual(calls[0]?.[1]?.params?.references, [
    { id: 'ref-1', citationKey: 'demo2026', title: 'Demo' },
    { id: 'ref-2', citationKey: 'target2026', title: 'Target' },
  ])
  assert.deepEqual(calls[1]?.[1]?.params?.reference, {
    id: 'ref-1',
    citationKey: 'demo2026',
    title: 'Demo',
  })

  console.log(JSON.stringify({
    ok: true,
    rawStyle: calls[0]?.[1]?.params?.style,
    rendered,
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
}
