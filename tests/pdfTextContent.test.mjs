import test from 'node:test'
import assert from 'node:assert/strict'
import { readPdfTextContent } from '../src/utils/pdfTextContent.js'

test('readPdfTextContent combines chunks from streamTextContent reader', async () => {
  const chunks = [
    {
      lang: 'en',
      styles: { a: { fontFamily: 'Test' } },
      items: [{ str: 'Hello' }],
    },
    {
      styles: { b: { fontFamily: 'Test 2' } },
      items: [{ str: 'World' }],
    },
  ]

  let index = 0
  const page = {
    streamTextContent() {
      return {
        getReader() {
          return {
            async read() {
              if (index >= chunks.length) {
                return { done: true, value: undefined }
              }
              return { done: false, value: chunks[index++] }
            },
            releaseLock() {},
          }
        },
      }
    },
  }

  const textContent = await readPdfTextContent(page, { disableNormalization: true })
  assert.equal(textContent.lang, 'en')
  assert.deepEqual(textContent.items, [{ str: 'Hello' }, { str: 'World' }])
  assert.deepEqual({ ...textContent.styles }, {
    a: { fontFamily: 'Test' },
    b: { fontFamily: 'Test 2' },
  })
})

test('readPdfTextContent falls back to getTextContent when streamTextContent is unavailable', async () => {
  const expected = {
    items: [{ str: 'Fallback' }],
    styles: { a: { fontFamily: 'Fallback' } },
    lang: 'zh-CN',
  }

  const page = {
    async getTextContent() {
      return expected
    },
  }

  const textContent = await readPdfTextContent(page)
  assert.equal(textContent, expected)
})
