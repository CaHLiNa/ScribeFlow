import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPdfViewerSrc,
  buildPdfViewerThemeOptions,
  normalizePdfViewerLocale,
  shouldUsePdfCanvasFilterFallback,
} from '../src/services/pdf/viewerUrl.js'

test('buildPdfViewerThemeOptions enables themed pages for a dark target page background', () => {
  assert.deepEqual(buildPdfViewerThemeOptions({
    themedPages: true,
    resolvedTheme: 'dark',
    pageBackground: 'rgb(20 19 17)',
    pageForeground: 'rgb(236 232 225)',
  }), {
    forcePageColors: true,
    pageBackground: 'rgb(20 19 17)',
    pageForeground: 'rgb(236 232 225)',
    useCanvasFilterFallback: false,
    viewerCssTheme: 2,
  })
})

test('buildPdfViewerThemeOptions uses a light viewer css theme when the custom pdf page background is light', () => {
  assert.deepEqual(buildPdfViewerThemeOptions({
    themedPages: true,
    resolvedTheme: 'dark',
    pageBackground: '#f3ecd9',
    pageForeground: '#1f2a1f',
  }), {
    forcePageColors: true,
    pageBackground: '#f3ecd9',
    pageForeground: '#1f2a1f',
    useCanvasFilterFallback: false,
    viewerCssTheme: 1,
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
    useCanvasFilterFallback: false,
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
    pageBackground: 'rgb(20 19 17)',
    pageForeground: 'rgb(236 232 225)',
    useCanvasFilterFallback: true,
    viewerCssTheme: 2,
  })
})

test('shouldUsePdfCanvasFilterFallback only enables on Apple WebKit when the target pdf page background is dark', () => {
  assert.equal(shouldUsePdfCanvasFilterFallback({
    themedPages: true,
    pageBackground: '#1f2a1f',
    resolvedTheme: 'dark',
    userAgent: 'Mozilla/5.0 AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  }), true)
  assert.equal(shouldUsePdfCanvasFilterFallback({
    themedPages: true,
    pageBackground: '#eaf4e4',
    resolvedTheme: 'light',
    userAgent: 'Mozilla/5.0 AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  }), false)
  assert.equal(shouldUsePdfCanvasFilterFallback({
    themedPages: true,
    pageBackground: '#1f2a1f',
    resolvedTheme: 'light',
    userAgent: 'Mozilla/5.0 AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  }), true)
  assert.equal(shouldUsePdfCanvasFilterFallback({
    themedPages: true,
    pageBackground: '#1f2a1f',
    resolvedTheme: 'dark',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
  }), false)
})

test('normalizePdfViewerLocale collapses app locales to the shipped viewer locales', () => {
  assert.equal(normalizePdfViewerLocale('zh-CN'), 'zh-CN')
  assert.equal(normalizePdfViewerLocale('zh-Hans'), 'zh-CN')
  assert.equal(normalizePdfViewerLocale('en-US'), 'en-US')
  assert.equal(normalizePdfViewerLocale('fr-FR'), 'en-US')
})

test('buildPdfViewerSrc includes PDF.js theme and page color params', () => {
  const result = buildPdfViewerSrc('blob:demo', {
    forcePageColors: true,
    pageBackground: 'rgb(20 19 17)',
    pageForeground: 'rgb(236 232 225)',
    useCanvasFilterFallback: true,
    viewerCssTheme: 2,
    locale: 'zh-CN',
  })

  const url = new URL(result, 'http://localhost')

  assert.equal(url.pathname, '/pdfjs-viewer/web/viewer.html')
  assert.equal(url.searchParams.get('file'), 'blob:demo')
  assert.equal(url.searchParams.get('maxcanvaspixels'), String(2 ** 27))
  assert.equal(url.searchParams.get('mindurationtoupdatecanvas'), '32')
  assert.equal(url.searchParams.get('enabledetailcanvas'), 'true')
  assert.equal(url.searchParams.get('locale'), 'zh-CN')
  assert.equal(url.searchParams.get('forcepagecolors'), 'true')
  assert.equal(url.searchParams.get('pagecolorsbackground'), 'rgb(20 19 17)')
  assert.equal(url.searchParams.get('pagecolorsforeground'), 'rgb(236 232 225)')
  assert.equal(url.searchParams.get('viewercsstheme'), '2')
  assert.equal(url.searchParams.get('altalscanvasfilterfallback'), 'true')
})

test('buildPdfViewerSrc omits optional params when not provided', () => {
  const result = buildPdfViewerSrc('blob:demo')
  const url = new URL(result, 'http://localhost')

  assert.equal(url.searchParams.get('file'), 'blob:demo')
  assert.equal(url.searchParams.get('maxcanvaspixels'), String(2 ** 27))
  assert.equal(url.searchParams.get('mindurationtoupdatecanvas'), '32')
  assert.equal(url.searchParams.get('enabledetailcanvas'), 'true')
  assert.equal(url.searchParams.has('locale'), false)
  assert.equal(url.searchParams.has('forcepagecolors'), false)
  assert.equal(url.searchParams.has('pagecolorsbackground'), false)
  assert.equal(url.searchParams.has('pagecolorsforeground'), false)
  assert.equal(url.searchParams.has('viewercsstheme'), false)
})
