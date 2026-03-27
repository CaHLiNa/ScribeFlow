import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const componentPath = path.join(repoRoot, 'src/components/editor/DocumentWorkspaceTab.vue')
const componentSource = readFileSync(componentPath, 'utf8')

test('document workspace tab keeps the v1 layout contract as a fixed dual-pane shell', () => {
  assert.match(componentSource, /class="document-workspace-tab-source"/)
  assert.match(componentSource, /v-if="previewVisible" class="document-workspace-tab-preview"/)
  assert.equal(
    componentSource.includes('flex: 1 1 0;'),
    true,
    'workspace source and preview panes should stay evenly split in the first fixed-layout version',
  )
})

test('document workspace tab exposes only preview visibility as public configuration', () => {
  assert.match(componentSource, /defineProps\(\{\s*previewVisible: \{ type: Boolean, default: false \},\s*\}\)/s)
  assert.equal(
    /split|ratio|resiz|drag|handle/i.test(componentSource),
    false,
    'workspace tab v1 should not advertise resize or drag configuration',
  )
})
