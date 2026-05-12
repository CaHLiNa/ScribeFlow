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
    if (cmd === 'citation_style_normalize') {
      await Promise.resolve()
      return 'ieee'
    }
    if (cmd === 'references_citation_render') {
      assert.equal(args?.params?.style, 'ieee')
      assert.equal(args?.params?.workspacePath, '/tmp/workspace')
      return '[1]'
    }
    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { formatCitation } = await vite.ssrLoadModule('/src/services/references/citationFormatter.js')
  const rendered = await formatCitation(
    'IEEE',
    'inline',
    { id: 'ref-1', citationKey: 'demo2026', title: 'Demo' },
    1,
    '/tmp/workspace',
  )

  assert.equal(rendered, '[1]')
  assert.deepEqual(calls.map(([cmd]) => cmd), [
    'citation_style_normalize',
    'references_citation_render',
  ])

  console.log(JSON.stringify({
    ok: true,
    normalizedStyle: calls[1]?.[1]?.params?.style,
    rendered,
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
}
