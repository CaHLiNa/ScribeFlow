import test from 'node:test'
import assert from 'node:assert/strict'

import {
  capturePdfPreviewSelectionContext,
  resolveLatexPdfReverseSyncPayload,
  resolvePdfPreviewEventTarget,
  scrollPdfPreviewToPoint,
} from '../src/services/latex/pdfPreviewSync.js'

test('pdf preview sync resolves text node targets across iframe realms', () => {
  const parent = { nodeType: 1, nodeName: 'SPAN' }
  const text = { nodeType: 3, parentElement: parent }

  assert.equal(resolvePdfPreviewEventTarget(parent), parent)
  assert.equal(resolvePdfPreviewEventTarget(text), parent)
  assert.equal(resolvePdfPreviewEventTarget(null), null)
})

test('pdf preview sync captures selection context around the cursor', () => {
  const result = capturePdfPreviewSelectionContext({
    anchorNode: {
      nodeName: '#text',
      textContent: 'alpha beta gamma',
    },
    anchorOffset: 6,
  })

  assert.deepEqual(result, {
    textBeforeSelection: 'alpha ',
    textAfterSelection: 'beta gamma',
  })
})

test('pdf preview sync resolves reverse-sync payload from iframe viewer events', () => {
  const pageDom = {
    dataset: { pageNumber: '2' },
    offsetLeft: 100,
    offsetTop: 200,
    offsetHeight: 400,
    getElementsByTagName(name) {
      return name === 'canvas' ? [{ offsetHeight: 800 }] : []
    },
    getElementsByClassName(name) {
      return name === 'canvasWrapper' ? [{ offsetLeft: 20, offsetTop: 0 }] : []
    },
  }
  const target = {
    nodeType: 1,
    nodeName: 'SPAN',
    closest(selector) {
      return selector === '.page' ? pageDom : null
    },
  }
  const frameWindow = {
    PDFViewerApplication: {
      pdfViewer: {
        _pages: [
          null,
          {
            getPagePoint(left, top) {
              return [left + 1, top + 2]
            },
          },
        ],
      },
    },
    document: {
      getElementById(id) {
        return id === 'viewerContainer' ? { scrollLeft: 30, scrollTop: 40 } : null
      },
    },
    getSelection() {
      return {
        anchorNode: { nodeName: '#text', textContent: 'hello world' },
        anchorOffset: 5,
      }
    },
  }

  const result = resolveLatexPdfReverseSyncPayload({
    event: {
      target,
      currentTarget: null,
      pageX: 180,
      pageY: 260,
    },
    frameWindow,
  })

  assert.deepEqual(result, {
    page: 2,
    pos: [91, 702],
    textBeforeSelection: 'hello',
    textAfterSelection: ' world',
  })
})

test('pdf preview sync scrolls via viewport coordinates when available', () => {
  const viewerContainer = { scrollTop: 0, scrollLeft: 0, clientHeight: 500 }
  const pageDom = { offsetTop: 200, offsetHeight: 1000, offsetLeft: 50 }
  const app = {
    pdfViewer: {
      scrollMode: 0,
      _pages: [
        {
          viewport: {
            convertToViewportPoint(x, y) {
              return [x * 2, y * 3]
            },
          },
        },
      ],
      scrollPageIntoView() {
        throw new Error('should not use fallback scroll path')
      },
    },
  }
  const doc = {
    getElementsByClassName(name) {
      return name === 'page' ? [pageDom] : []
    },
    getElementById(id) {
      return id === 'viewerContainer' ? viewerContainer : null
    },
  }

  const scrolled = scrollPdfPreviewToPoint({
    app,
    doc,
    point: { page: 1, x: 20, y: 100 },
  })

  assert.equal(scrolled, true)
  assert.equal(viewerContainer.scrollTop, 700)
})
