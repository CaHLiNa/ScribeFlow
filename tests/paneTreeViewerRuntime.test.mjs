import test from 'node:test'
import assert from 'node:assert/strict'

import {
  hasVisiblePdfPane,
  hasVisibleViewerType,
} from '../src/domains/editor/paneTreeViewerRuntime.js'

test('hasVisiblePdfPane returns true when the active leaf tab is a PDF', () => {
  const paneTree = {
    type: 'leaf',
    id: 'pane-root',
    tabs: ['/tmp/paper.pdf'],
    activeTab: '/tmp/paper.pdf',
  }

  assert.equal(hasVisiblePdfPane(paneTree), true)
})

test('hasVisiblePdfPane ignores non-active PDF tabs in a leaf', () => {
  const paneTree = {
    type: 'leaf',
    id: 'pane-root',
    tabs: ['/tmp/paper.pdf', '/tmp/notes.md'],
    activeTab: '/tmp/notes.md',
  }

  assert.equal(hasVisiblePdfPane(paneTree), false)
})

test('hasVisibleViewerType walks split pane trees using visible active tabs only', () => {
  const paneTree = {
    type: 'split',
    direction: 'vertical',
    ratio: 0.5,
    children: [
      {
        type: 'leaf',
        id: 'pane-left',
        tabs: ['/tmp/notes.md'],
        activeTab: '/tmp/notes.md',
      },
      {
        type: 'leaf',
        id: 'pane-right',
        tabs: ['/tmp/translated.pdf', '/tmp/source.tex'],
        activeTab: '/tmp/translated.pdf',
      },
    ],
  }

  assert.equal(hasVisibleViewerType(paneTree, 'pdf'), true)
  assert.equal(hasVisibleViewerType(paneTree, 'text'), true)
  assert.equal(hasVisibleViewerType(paneTree, 'csv'), false)
})

test('hasVisibleViewerType returns false for empty or malformed pane trees', () => {
  assert.equal(hasVisibleViewerType(null, 'pdf'), false)
  assert.equal(hasVisibleViewerType({}, 'pdf'), false)
  assert.equal(hasVisibleViewerType({ type: 'leaf', activeTab: null }, 'pdf'), false)
  assert.equal(hasVisibleViewerType({ type: 'split', children: null }, 'pdf'), false)
})
