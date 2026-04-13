import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function readSource(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test('workbench rail only excludes explicit interactive controls from window dragging', () => {
  const railSource = readSource('src/components/layout/WorkbenchRail.vue')
  const editorPaneSource = readSource('src/components/editor/EditorPane.vue')

  assert.match(railSource, /if \(target\?\.closest\('\[data-window-drag-ignore="true"\]'\)\) return/)
  assert.match(
    editorPaneSource,
    /<div ref="documentTitleWrapRef" class="document-title-wrap document-title-wrap--rail">/
  )
  assert.match(editorPaneSource, /class="document-title-button document-title-button--rail"[\s\S]*data-window-drag-ignore="true"/)
  assert.match(
    editorPaneSource,
    /class="document-tabs-menu document-tabs-menu--rail"[\s\S]*data-window-drag-ignore="true"/
  )
  assert.match(
    editorPaneSource,
    /\.document-title-wrap--rail \{[\s\S]*flex: 0 1 auto;[\s\S]*width: auto;[\s\S]*max-width: 100%;/
  )
})
