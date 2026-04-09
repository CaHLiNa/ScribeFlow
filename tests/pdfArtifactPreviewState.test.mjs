import test from 'node:test'
import assert from 'node:assert/strict'

import {
  capturePdfViewportAnchor,
  resolvePdfViewportCurrentPage,
  resolvePdfViewportScrollTop,
} from '../src/services/pdf/artifactPreviewState.js'

const pageMetrics = [
  { pageNumber: 1, offsetTop: 0, offsetHeight: 900 },
  { pageNumber: 2, offsetTop: 918, offsetHeight: 900 },
  { pageNumber: 3, offsetTop: 1836, offsetHeight: 900 },
]

test('pdf viewport current page prefers the page with the largest visible overlap', () => {
  assert.equal(resolvePdfViewportCurrentPage({
    pageMetrics,
    scrollTop: 840,
    viewportHeight: 520,
    fallbackPage: 1,
  }), 2)
})

test('pdf viewport anchor preserves page-relative offset', () => {
  const anchor = capturePdfViewportAnchor({
    pageMetrics,
    scrollTop: 1130,
    viewportHeight: 640,
    fallbackPage: 1,
  })

  assert.equal(anchor.pageNumber, 2)
  assert.equal(anchor.offsetRatio.toFixed(3), '0.236')
})

test('pdf viewport restore scroll top reconstructs the saved page-relative offset', () => {
  const top = resolvePdfViewportScrollTop(
    { pageNumber: 2, offsetRatio: 0.236 },
    [
      { pageNumber: 1, offsetTop: 0, offsetHeight: 1200 },
      { pageNumber: 2, offsetTop: 1224, offsetHeight: 1200 },
      { pageNumber: 3, offsetTop: 2448, offsetHeight: 1200 },
    ],
    0,
  )

  assert.equal(Math.round(top), 1507)
})
