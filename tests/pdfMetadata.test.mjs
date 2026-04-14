import test from 'node:test'
import assert from 'node:assert/strict'

import { readPdfPageTextContent } from '../src/services/references/pdfMetadata.js'

test('readPdfPageTextContent reads streamTextContent via getReader without async iterator support', async () => {
  const chunks = [
    {
      lang: 'en',
      styles: { heading: { fontWeight: '700' } },
      items: [{ str: 'Hello' }],
    },
    {
      styles: { body: { fontWeight: '400' } },
      items: [{ str: 'World' }],
    },
  ]
  let released = false

  const textContent = await readPdfPageTextContent({
    streamTextContent() {
      let index = 0
      return {
        getReader() {
          return {
            async read() {
              if (index >= chunks.length) return { done: true, value: undefined }
              const value = chunks[index]
              index += 1
              return { done: false, value }
            },
            releaseLock() {
              released = true
            },
          }
        },
      }
    },
    getTextContent() {
      throw new Error('getTextContent fallback should not be used')
    },
  })

  assert.equal(textContent.lang, 'en')
  assert.deepEqual(textContent.items, [{ str: 'Hello' }, { str: 'World' }])
  assert.deepEqual({ ...textContent.styles }, {
    heading: { fontWeight: '700' },
    body: { fontWeight: '400' },
  })
  assert.equal(released, true)
})

test('readPdfPageTextContent falls back to getTextContent when streamTextContent is unavailable', async () => {
  const textContent = await readPdfPageTextContent({
    async getTextContent() {
      return {
        items: [{ str: 'Fallback' }],
        styles: { body: { fontWeight: '400' } },
        lang: null,
      }
    },
  })

  assert.deepEqual(textContent.items, [{ str: 'Fallback' }])
  assert.deepEqual({ ...textContent.styles }, { body: { fontWeight: '400' } })
})
