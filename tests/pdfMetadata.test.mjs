import test from 'node:test'
import assert from 'node:assert/strict'

import { extractPdfMetadata, extractTextFromPdf } from '../src/services/references/pdfMetadata.js'

globalThis.window = globalThis.window || {}
window.__TAURI_INTERNALS__ = {
  invoke: async (command, args = {}) => {
    if (command === 'references_pdf_extract_text') {
      return `TEXT:${args.params?.filePath || ''}`
    }
    if (command === 'references_pdf_extract_metadata') {
      return {
        firstText: 'Control Barrier Functions',
        metadata: {
          title: 'Control Barrier Functions',
          author: 'Aaron D. Ames',
          doi: '10.1109/TAC.2014.1234567',
          year: 2014,
        },
      }
    }
    throw new Error(`Unexpected invoke command: ${command}`)
  },
}

test('extractTextFromPdf routes through the Rust PDF extraction command', async () => {
  const text = await extractTextFromPdf('/tmp/control.pdf')
  assert.equal(text, 'TEXT:/tmp/control.pdf')
})

test('extractPdfMetadata routes through the Rust metadata command', async () => {
  const result = await extractPdfMetadata('/tmp/control.pdf')

  assert.equal(result.firstText, 'Control Barrier Functions')
  assert.equal(result.metadata.title, 'Control Barrier Functions')
  assert.equal(result.metadata.author, 'Aaron D. Ames')
  assert.equal(result.metadata.doi, '10.1109/TAC.2014.1234567')
  assert.equal(result.metadata.year, 2014)
})
