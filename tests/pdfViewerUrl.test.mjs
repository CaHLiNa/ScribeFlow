import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPdfViewerSrc,
  buildPdfViewerThemeOptions,
  shouldUsePdfCanvasFilterFallback,
} from '../src/services/pdf/viewerUrl.js'

test('buildPdfViewerThemeOptions enables themed pages for the resolved dark theme', () => {
  assert.deepEqual(buildPdfViewerThemeOptions({
    themedPages: true,
    resolvedTheme: 'dark',
    pageBackground: 'rgb(20 19 17)',
    pageForeground: 'rgb(236 232 225)',
  }), {
    forcePageColors: true,
    pageBackground: 'rgb(20 19 17)',
    pageForeground: 'rgb(236 232 225)',
    viewerCssTheme: 2,
  })
})

test('buildPdfViewerThemeOptions disables forced page colors when themed pages are off', () => {
  assert.deepEqual(buildPdfViewerThemeOptions({
    themedPages: false,
    resolvedTheme: 'light',
    pageBackground: 'rgb(255 255 255)',
    pageForeground: 'rgb(17 17 17)',
  }), {
    forcePageColors: false,
    pageBackground: '',
    pageForeground: '',
    viewerCssTheme: 1,
  })
})

test('buildPdfViewerThemeOptions disables PDF.js page colors when canvas fallback is active', () => {
  assert.deepEqual(buildPdfViewerThemeOptions({
    themedPages: true,
    resolvedTheme: 'dark',
    usePageFilterFallback: true,
    pageBackground: 'rgb(20 19 17)',
    pageForeground: 'rgb(236 232 225)',
  }), {
    forcePageColors: false,
    pageBackground: '',
    pageForeground: '',
    viewerCssTheme: 2,
  })
})

test('shouldUsePdfCanvasFilterFallback only enables on dark Apple WebKit themed pages', () => {
  assert.equal(shouldUsePdfCanvasFilterFallback({
    themedPages: true,
    resolvedTheme: 'dark',
    userAgent: 'Mozilla/5.0 AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  }), true)
  assert.equal(shouldUsePdfCanvasFilterFallback({
    themedPages: true,
    resolvedTheme: 'light',
    userAgent: 'Mozilla/5.0 AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  }), false)
  assert.equal(shouldUsePdfCanvasFilterFallback({
    themedPages: true,
    resolvedTheme: 'dark',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
  }), false)
})

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
