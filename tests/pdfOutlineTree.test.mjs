import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizePdfOutlineTree } from '../src/services/pdfOutlineTree.js'

test('normalizes outline entries into nested tree items', () => {
  const tree = normalizePdfOutlineTree([
    {
      title: ' Intro ',
      dest: 'intro',
      items: [
        { title: 'Subsection', dest: 'sub-1' },
      ],
    },
    {
      title: '\u0000',
      url: 'https://example.com',
    },
  ])

  assert.deepEqual(tree, [
    {
      id: '0',
      title: 'Intro',
      dest: 'intro',
      url: '',
      bold: false,
      italic: false,
      items: [
        {
          id: '0.0',
          title: 'Subsection',
          dest: 'sub-1',
          url: '',
          bold: false,
          italic: false,
          items: [],
        },
      ],
    },
    {
      id: '1',
      title: '-',
      dest: null,
      url: 'https://example.com',
      bold: false,
      italic: false,
      items: [],
    },
  ])
})
