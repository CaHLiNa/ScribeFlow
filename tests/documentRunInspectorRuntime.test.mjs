import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDocumentRunArtifactCards,
  shortenDocumentPath,
} from '../src/domains/document/documentRunInspectorRuntime.js'

function t(value, params = {}) {
  return String(value || '').replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`))
}

test('shortenDocumentPath keeps short paths and compresses long workspace tails', () => {
  assert.equal(shortenDocumentPath('/Users/math173sr/Desktop/paper/main.tex'), '.../paper/main.tex')
  assert.equal(shortenDocumentPath('/workspace/main.tex'), 'workspace/main.tex')
  assert.equal(shortenDocumentPath(''), '')
})

test('buildDocumentRunArtifactCards compacts compile diagnosis artifacts for sidebar display', () => {
  const cards = buildDocumentRunArtifactCards([{
    id: 'artifact-1',
    type: 'compile_diagnosis',
    title: 'LaTeX compile diagnosis',
    summary: 'Compile succeeded with 18 warnings',
    compileTargetPath: '/Users/math173sr/Desktop/paper/conference/main.tex',
    durationMs: 735,
    commandPreview: 'latexmk -pdf main.tex',
    problems: [
      { severity: 'warning', line: 75, message: 'Unknown citation key: Lu2025' },
      { severity: 'warning', line: 77, message: 'Unknown citation key: Hu2021' },
      { severity: 'warning', line: 79, message: 'Unknown citation key: Wang2019' },
      { severity: 'warning', line: 81, message: 'Unknown citation key: Li2020' },
    ],
    body: 'Rc files read:\nNONE',
  }], { t })

  assert.equal(cards.length, 1)
  assert.equal(cards[0].title, 'Compile succeeded with 18 warnings')
  assert.equal(cards[0].summary, 'LaTeX compile diagnosis')
  assert.deepEqual(cards[0].meta.map((entry) => entry.label), ['Target', 'Duration', 'Command'])
  assert.equal(cards[0].items.length, 3)
  assert.equal(cards[0].moreCount, 1)
  assert.equal(cards[0].detailsLabel, 'Raw compile log')
  assert.equal(cards[0].detailsAvailable, true)
  assert.equal(cards[0].detailsSourceIndex, 0)
  assert.equal('detailsBody' in cards[0], false)
})

test('buildDocumentRunArtifactCards compacts patch artifacts into short change lists', () => {
  const cards = buildDocumentRunArtifactCards([{
    id: 'artifact-2',
    type: 'patch',
    title: 'Edit file',
    summary: 'Updated main.tex',
    sourceFile: '/Users/math173sr/Desktop/paper/conference/main.tex',
    changes: [
      { filePath: '/Users/math173sr/Desktop/paper/conference/main.tex', summary: 'Replaced text A -> B' },
      { filePath: '/Users/math173sr/Desktop/paper/conference/main.tex', summary: 'Replaced text C -> D' },
      { filePath: '/Users/math173sr/Desktop/paper/conference/main.tex', summary: 'Replaced text E -> F' },
      { filePath: '/Users/math173sr/Desktop/paper/conference/main.tex', summary: 'Replaced text G -> H' },
    ],
    body: 'Patch body',
  }], { t })

  assert.equal(cards.length, 1)
  assert.equal(cards[0].badge, 'Patch')
  assert.equal(cards[0].items.length, 3)
  assert.equal(cards[0].moreCount, 1)
  assert.equal(cards[0].detailsLabel, 'Patch details')
  assert.equal(cards[0].detailsAvailable, true)
  assert.equal(cards[0].detailsSourceIndex, 0)
})
