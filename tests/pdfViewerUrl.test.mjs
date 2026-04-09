import test from 'node:test'
import assert from 'node:assert/strict'

import { buildPdfViewerSrc } from '../src/services/pdf/viewerUrl.js'

test('buildPdfViewerSrc includes PDF.js theme and page color params', () => {
  const result = buildPdfViewerSrc('blob:demo', {
    forcePageColors: true,
    pageBackground: 'rgb(20 19 17)',
    pageForeground: 'rgb(236 232 225)',
    viewerCssTheme: 2,
  })

  const url = new URL(result, 'http://localhost')

  assert.equal(url.pathname, '/pdfjs-viewer/web/viewer.html')
  assert.equal(url.searchParams.get('file'), 'blob:demo')
  assert.equal(url.searchParams.get('forcepagecolors'), 'true')
  assert.equal(url.searchParams.get('pagecolorsbackground'), 'rgb(20 19 17)')
  assert.equal(url.searchParams.get('pagecolorsforeground'), 'rgb(236 232 225)')
  assert.equal(url.searchParams.get('viewercsstheme'), '2')
})

test('buildPdfViewerSrc omits optional params when not provided', () => {
  const result = buildPdfViewerSrc('blob:demo')
  const url = new URL(result, 'http://localhost')

  assert.equal(url.searchParams.get('file'), 'blob:demo')
  assert.equal(url.searchParams.has('forcepagecolors'), false)
  assert.equal(url.searchParams.has('pagecolorsbackground'), false)
  assert.equal(url.searchParams.has('pagecolorsforeground'), false)
  assert.equal(url.searchParams.has('viewercsstheme'), false)
})
