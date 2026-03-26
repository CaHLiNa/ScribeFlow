import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const baselineFiles = [
  'src/components/editor/ReferenceView.vue',
  'src/components/editor/NotebookCell.vue',
  'src/components/editor/ExecutionResultCard.vue',
  'src/components/editor/ReviewBar.vue',
  'src/components/editor/NotebookReviewBar.vue',
  'src/components/editor/ResearchNoteCard.vue',
  'src/components/editor/WorkspaceStarter.vue',
  'src/components/editor/AiLauncher.vue',
  'src/components/editor/CitationPalette.vue',
  'src/components/editor/ImageViewer.vue',
  'src/components/editor/PdfViewer.vue',
  'src/components/sidebar/FileTree.vue',
  'src/components/sidebar/AddReferenceDialog.vue',
  'src/components/sidebar/FileTreeItem.vue',
  'src/components/sidebar/ReferenceImportPreviewDialog.vue',
  'src/components/sidebar/ReferenceMergeDialog.vue',
  'src/components/sidebar/AiWorkbenchSidebar.vue',
  'src/components/sidebar/LibraryInspectorSidebar.vue',
  'src/components/sidebar/LibrarySidebar.vue',
  'src/components/sidebar/ReferenceItem.vue',
  'src/components/library/GlobalLibraryWorkbench.vue',
  'src/components/library/LibraryReferenceEditor.vue',
]

test('newly-baselined editor, sidebar, and library surfaces no longer use raw form controls', () => {
  for (const relativePath of baselineFiles) {
    const absolutePath = path.join(repoRoot, relativePath)
    const content = readFileSync(absolutePath, 'utf8')
    assert.equal(
      /<(button|input|select|textarea)\b/.test(content),
      false,
      `${relativePath} should use shared UI primitives instead of raw form controls`
    )
  }
})
