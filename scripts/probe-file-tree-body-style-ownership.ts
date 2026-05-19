import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const fileTreeSource = await readFile('src/components/sidebar/FileTree.vue', 'utf8')
const bodySource = await readFile('src/components/sidebar/FileTreeBody.vue', 'utf8')

function scopedStyleBlock(source = '') {
  return source.match(/<style scoped>[\s\S]*?<\/style>/)?.[0] || ''
}

const fileTreeStyle = scopedStyleBlock(fileTreeSource)
const bodyStyle = scopedStyleBlock(bodySource)

assert.match(
  fileTreeSource,
  /import FileTreeBody from '\.\/FileTreeBody\.vue'/,
  'FileTree.vue must render tree body through FileTreeBody',
)
assert.match(
  fileTreeSource,
  /<FileTreeBody[\s\S]*@tree-container-ready="setTreeContainer"[\s\S]*@tree-scroll="onTreeScroll"/,
  'FileTree.vue must receive the real scroll container from FileTreeBody and keep scroll orchestration wired',
)
assert.match(
  fileTreeSource,
  /@tree-keydown="handleTreeKeydown"/,
  'FileTree.vue must keep keyboard orchestration wired through FileTreeBody',
)
assert.match(
  fileTreeSource,
  /@open-file="openFile"/,
  'FileTree.vue must keep file-opening orchestration wired through FileTreeBody',
)
assert.match(
  fileTreeSource,
  /@drop-on-dir="onDropOnDir"/,
  'FileTree.vue must keep drag/drop orchestration wired through FileTreeBody',
)
assert.match(
  fileTreeSource,
  /fileTreeBody\.value\?\.selectRootRenameInput\?\.\(\)/,
  'FileTree.vue must delegate root inline-create input selection to FileTreeBody',
)
assert.doesNotMatch(
  fileTreeSource,
  /import FileTreeItem from '\.\/FileTreeItem\.vue'|import UiInput from '\.\.\/shared\/ui\/UiInput\.vue'/,
  'FileTree.vue must not import body-row presentation components directly',
)

for (const className of [
  'file-tree-body',
  'file-tree-scroll',
  'file-tree-root-rename-row',
  'file-tree-rename-input',
  'file-tree-drop-indicator',
  'file-tree-empty-state',
]) {
  assert.doesNotMatch(
    fileTreeStyle,
    new RegExp(`\\.${className}\\b`),
    `FileTree.vue must not own body scoped style .${className}`,
  )
  assert.match(
    bodyStyle,
    new RegExp(`\\.${className}\\b`),
    `FileTreeBody.vue must own body scoped style .${className}`,
  )
}

assert.match(
  bodySource,
  /import FileTreeItem from '\.\/FileTreeItem\.vue'/,
  'FileTreeBody.vue must own virtual row rendering through FileTreeItem',
)
assert.match(
  bodySource,
  /import UiInput from '\.\.\/shared\/ui\/UiInput\.vue'/,
  'FileTreeBody.vue must own the root inline-create input',
)
assert.match(
  bodySource,
  /emit\('tree-container-ready', treeContainer\.value\)/,
  'FileTreeBody.vue must expose the real scroll element to parent orchestration',
)
assert.match(
  bodySource,
  /selectRootRenameInput\(\)/,
  'FileTreeBody.vue must expose root rename input selection as a narrow method',
)
assert.doesNotMatch(
  bodySource,
  /useFilesStore|useEditorStore|useWorkspaceStore|workspacePathExists|askNativeDialog|revealPathInFileManager/,
  'FileTreeBody.vue must stay presentation-only and avoid store/service authority',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    fileTreeUsesBodyComponent: true,
    parentKeepsTreeOrchestration: true,
    bodyOwnsVirtualRowsAndEmptyState: true,
    bodyOwnsBodyStyles: true,
  },
}, null, 2))
