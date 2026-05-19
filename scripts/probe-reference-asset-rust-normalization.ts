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
  const renameResult = 'rust-owned-asset-rename'

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'references_asset_store') {
      return args?.params?.reference || {}
    }
    if (cmd === 'references_asset_rename') {
      return renameResult
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    renameReferencePdfAsset,
    storeReferencePdf,
    storeReferencePdfWithOptions,
  } = await vite.ssrLoadModule('/src/services/references/referenceAssets.ts')

  await storeReferencePdf(false, 'not-a-reference', 42)
  await storeReferencePdfWithOptions(
    ' /tmp/config/ ',
    { id: 'ref-a' },
    ' /tmp/source.pdf ',
    {
      existingFulltextSourcePath: ' /tmp/source.txt ',
      references: [{ id: 'ref-a' }],
      referenceId: ' ref-a ',
    },
  )
  const renamed = await renameReferencePdfAsset('', null, null, {
    references: [{ id: 'ref-a' }],
    referenceId: ' ref-a ',
  })

  assert.deepEqual(calls.map((call) => call.cmd), [
    'references_asset_store',
    'references_asset_store',
    'references_asset_rename',
  ])
  assert.deepEqual(calls[0].args.params, {
    globalConfigDir: false,
    reference: 'not-a-reference',
    references: [],
    referenceId: '',
    sourcePath: 42,
    existingFulltextSourcePath: '',
  })
  assert.deepEqual(calls[1].args.params, {
    globalConfigDir: ' /tmp/config/ ',
    reference: { id: 'ref-a' },
    references: [{ id: 'ref-a' }],
    referenceId: ' ref-a ',
    sourcePath: ' /tmp/source.pdf ',
    existingFulltextSourcePath: ' /tmp/source.txt ',
  })
  assert.deepEqual(calls[2].args.params, {
    globalConfigDir: '',
    reference: null,
    references: [{ id: 'ref-a' }],
    referenceId: ' ref-a ',
    nextBaseName: null,
  })
  assert.strictEqual(renamed, renameResult)

  console.log('reference asset rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
