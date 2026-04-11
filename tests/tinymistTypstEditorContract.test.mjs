import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const editorIndexPath = path.join(repoRoot, 'src/services/tinymist/editor/index.js')
const highlightPath = path.join(repoRoot, 'src/services/tinymist/editor/highlight.js')
const editorIndexSource = readFileSync(editorIndexPath, 'utf8')
const highlightSource = readFileSync(highlightPath, 'utf8')

test('Typst editor extensions do not register Tinymist hover popups', () => {
  assert.equal(
    /createTinymistTypstHoverExtension|hoverTooltip|tooltips\(/.test(editorIndexSource),
    false,
    'Typst editor should not wire hover tooltip support into the default extension set',
  )
})

test('Typst highlight extension subscribes to Tinymist semantic tokens', () => {
  assert.match(highlightSource, /subscribeTinymistSemanticTokens/)
  assert.match(highlightSource, /subscribeTinymistStatus/)
  assert.match(highlightSource, /buildSemanticTokenDecorations/)
  assert.match(highlightSource, /cm-tinymist-token-/)
})
