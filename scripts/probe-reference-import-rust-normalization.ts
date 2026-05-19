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
  const results = {
    bibtex: { id: 'rust-owned-bibtex-parse' },
    ris: 'rust-owned-ris-parse',
    cslJson: { id: 'rust-owned-csl-json-parse' },
    autoParse: 'rust-owned-auto-parse',
    fileParse: { id: 'rust-owned-file-parse' },
    blankImport: 'rust-owned-blank-import',
    arrayImport: { id: 'rust-owned-array-import' },
    pdfImport: 'rust-owned-pdf-import',
    duplicate: false,
    merged: { id: 'rust-owned-merge' },
  }

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'references_import_from_text') {
      return Array.isArray(args?.params?.content) ? results.arrayImport : results.blankImport
    }
    if (cmd === 'references_import_parse_text') {
      if (args?.params?.format === 'bibtex') return results.bibtex
      if (args?.params?.format === 'ris') return results.ris
      if (args?.params?.format === 'csl-json') return results.cslJson
      return results.autoParse
    }
    if (cmd === 'references_import_parse_file') {
      return results.fileParse
    }
    if (cmd === 'references_import_detect_format') {
      return 'auto'
    }
    if (cmd === 'references_import_pdf') {
      return results.pdfImport
    }
    if (cmd === 'references_find_duplicate') {
      return results.duplicate
    }
    if (cmd === 'references_merge_imported') {
      return results.merged
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    detectReferenceImportFormat,
    findDuplicateReference,
    importReferenceFromPdf,
    importReferencesFromText,
    mergeImportedReferences,
    parseBibTeXText,
    parseCSLJSONText,
    parseReferenceImportText,
    parseReferenceImportFile,
    parseRisText,
  } = await vite.ssrLoadModule('/src/services/references/referenceImport.ts')

  const bibtexResult = await parseBibTeXText('raw-bibtex')
  const risResult = await parseRisText('raw-ris')
  const cslJsonResult = await parseCSLJSONText('raw-csl-json')
  const blankResult = await importReferencesFromText('   ')
  const arrayResult = await importReferencesFromText(['10.1000/demo'])
  const parsedResult = await parseReferenceImportText(42, false)
  const fileResult = await parseReferenceImportFile(99, null)
  await detectReferenceImportFormat(null)
  const pdfResult = await importReferenceFromPdf(false)
  const duplicateResult = await findDuplicateReference('existing', ['candidate'])
  const mergedResult = await mergeImportedReferences('existing', ['imported'])

  assert.deepEqual(calls.map((call) => call.cmd), [
    'references_import_parse_text',
    'references_import_parse_text',
    'references_import_parse_text',
    'references_import_from_text',
    'references_import_from_text',
    'references_import_parse_text',
    'references_import_parse_file',
    'references_import_detect_format',
    'references_import_pdf',
    'references_find_duplicate',
    'references_merge_imported',
  ])
  assert.deepEqual(calls[0].args.params, {
    content: 'raw-bibtex',
    format: 'bibtex',
  })
  assert.deepEqual(calls[1].args.params, {
    content: 'raw-ris',
    format: 'ris',
  })
  assert.deepEqual(calls[2].args.params, {
    content: 'raw-csl-json',
    format: 'csl-json',
  })
  assert.deepEqual(calls[3].args.params, {
    content: '   ',
    format: 'auto',
  })
  assert.deepEqual(calls[4].args.params, {
    content: ['10.1000/demo'],
    format: 'auto',
  })
  assert.deepEqual(calls[5].args.params, {
    content: 42,
    format: false,
  })
  assert.deepEqual(calls[6].args.params, {
    filePath: 99,
    format: null,
  })
  assert.deepEqual(calls[7].args.params, {
    content: null,
  })
  assert.deepEqual(calls[8].args.params, {
    filePath: false,
  })
  assert.deepEqual(calls[9].args.params, {
    existing: 'existing',
    candidate: ['candidate'],
  })
  assert.deepEqual(calls[10].args.params, {
    existing: 'existing',
    imported: ['imported'],
  })
  assert.strictEqual(bibtexResult, results.bibtex)
  assert.strictEqual(risResult, results.ris)
  assert.strictEqual(cslJsonResult, results.cslJson)
  assert.strictEqual(blankResult, results.blankImport)
  assert.strictEqual(arrayResult, results.arrayImport)
  assert.strictEqual(parsedResult, results.autoParse)
  assert.strictEqual(fileResult, results.fileParse)
  assert.strictEqual(pdfResult, results.pdfImport)
  assert.strictEqual(duplicateResult, results.duplicate)
  assert.strictEqual(mergedResult, results.merged)

  console.log('reference import rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
