import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const inlineStyleBaselineFiles = [
  'src/components/editor/CsvEditor.vue',
  'src/components/editor/DocumentPdfViewer.vue',
  'src/components/editor/EditorContextMenu.vue',
  'src/components/editor/EditorPane.vue',
  'src/components/editor/LatexPdfViewer.vue',
  'src/components/editor/NotebookEditor.vue',
  'src/components/editor/TabBar.vue',
  'src/components/editor/TypstPdfViewer.vue',
  'src/components/editor/TypstNativePreview.vue',
  'src/components/editor/TextEditor.vue',
  'src/components/sidebar/ReferenceList.vue',
]

test('baselined surfaces avoid static inline style chrome', () => {
  for (const relativePath of inlineStyleBaselineFiles) {
    const absolutePath = path.join(repoRoot, relativePath)
    const content = readFileSync(absolutePath, 'utf8')
    assert.equal(
      /(^|\s)style="/m.test(content),
      false,
      `${relativePath} should move static chrome styles into scoped CSS`
    )
  }
})
