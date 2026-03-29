import test from 'node:test'
import assert from 'node:assert/strict'

import { hasVisibleViewerType } from '../src/domains/editor/paneTreeViewerRuntime.js'

test('hasVisibleViewerType returns true when the active leaf tab matches the requested viewer type', () => {
  const paneTree = {
    type: 'leaf',
    id: 'pane-root',
    tabs: ['/tmp/paper.pdf'],
    activeTab: '/tmp/paper.pdf',
  }

  assert.equal(hasVisibleViewerType(paneTree, 'unsupported-binary'), true)
})

test('hasVisibleViewerType ignores non-active tabs in a leaf', () => {
  const paneTree = {
    type: 'leaf',
    id: 'pane-root',
    tabs: ['/tmp/paper.pdf', '/tmp/notes.md'],
    activeTab: '/tmp/notes.md',
  }

  assert.equal(hasVisibleViewerType(paneTree, 'unsupported-binary'), false)
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

  assert.equal(hasVisibleViewerType(paneTree, 'unsupported-binary'), true)
  assert.equal(hasVisibleViewerType(paneTree, 'text'), true)
  assert.equal(hasVisibleViewerType(paneTree, 'csv'), false)
})

test('hasVisibleViewerType returns false for empty or malformed pane trees', () => {
  assert.equal(hasVisibleViewerType(null, 'unsupported-binary'), false)
  assert.equal(hasVisibleViewerType({}, 'unsupported-binary'), false)
  assert.equal(hasVisibleViewerType({ type: 'leaf', activeTab: null }, 'unsupported-binary'), false)
  assert.equal(hasVisibleViewerType({ type: 'split', children: null }, 'unsupported-binary'), false)
})
