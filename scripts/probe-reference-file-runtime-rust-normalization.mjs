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

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeString(value) {
  return typeof value === 'string' ? value : ''
}

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'references_scan_workspace_styles') {
      const params = args?.params || {}
      const workspacePath = normalizeString(params.workspacePath)
      return workspacePath ? [{ key: 'local-style', label: 'Local Style' }] : []
    }

    if (cmd === 'references_write_bib_file') {
      const params = args?.params || {}
      const texPath = normalizeString(params.texPath)
      const references = normalizeArray(params.references)
      const citationStyle = normalizeString(params.citationStyle)
      return texPath && references.length > 0 && citationStyle ? `${texPath}.bib` : ''
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { scanWorkspaceCitationStyles, writeReferenceBibFile } = await vite.ssrLoadModule(
    '/src/services/references/referenceRuntime.js',
  )

  const scanResult = await scanWorkspaceCitationStyles(42)
  const invalidWriteResult = await writeReferenceBibFile(42, 'not-array', null)
  const validWriteResult = await writeReferenceBibFile(
    '/tmp/main.tex',
    [{ id: 'ref-a' }],
    'ieee',
  )

  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'references_scan_workspace_styles',
      'references_write_bib_file',
      'references_write_bib_file',
    ],
  )
  assert.deepEqual(calls[0].args.params, { workspacePath: 42 })
  assert.deepEqual(calls[1].args.params, {
    texPath: 42,
    references: 'not-array',
    citationStyle: null,
  })
  assert.deepEqual(calls[2].args.params, {
    texPath: '/tmp/main.tex',
    references: [{ id: 'ref-a' }],
    citationStyle: 'ieee',
  })
  assert.deepEqual(scanResult, [])
  assert.equal(invalidWriteResult, '')
  assert.equal(validWriteResult, '/tmp/main.tex.bib')

  console.log('reference file runtime rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
