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

    if (cmd === 'references_import_from_text') {
      return Array.isArray(args?.params?.content) ? [{ id: 'array-content' }] : []
    }
    if (cmd === 'references_import_parse_text') {
      return []
    }
    if (cmd === 'references_import_detect_format') {
      return 'auto'
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    detectReferenceImportFormat,
    importReferencesFromText,
    parseReferenceImportText,
  } = await vite.ssrLoadModule('/src/services/references/referenceImport.js')

  const blankResult = await importReferencesFromText('   ')
  const arrayResult = await importReferencesFromText(['10.1000/demo'])
  await parseReferenceImportText(42, false)
  await detectReferenceImportFormat(null)

  assert.deepEqual(calls.map((call) => call.cmd), [
    'references_import_from_text',
    'references_import_from_text',
    'references_import_parse_text',
    'references_import_detect_format',
  ])
  assert.deepEqual(calls[0].args.params, {
    content: '   ',
    format: 'auto',
  })
  assert.deepEqual(calls[1].args.params, {
    content: ['10.1000/demo'],
    format: 'auto',
  })
  assert.deepEqual(calls[2].args.params, {
    content: 42,
    format: false,
  })
  assert.deepEqual(calls[3].args.params, {
    content: null,
  })
  assert.deepEqual(blankResult, [])
  assert.deepEqual(arrayResult, [{ id: 'array-content' }])

  console.log('reference import rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
