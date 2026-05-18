import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const railSource = await readFile('src/components/layout/WorkbenchRail.vue', 'utf8')
const titleAreaSource = await readFile('src/components/layout/WorkbenchRailTitleArea.vue', 'utf8')

function scopedStyleBlock(source = '') {
  return source.match(/<style scoped>[\s\S]*?<\/style>/)?.[0] || ''
}

const railStyle = scopedStyleBlock(railSource)
const titleAreaStyle = scopedStyleBlock(titleAreaSource)

assert.match(
  railSource,
  /import WorkbenchRailTitleArea from '\.\/WorkbenchRailTitleArea\.vue'/,
  'WorkbenchRail must render title/menu presentation through WorkbenchRailTitleArea',
)
assert.match(
  railSource,
  /<WorkbenchRailTitleArea[\s\S]*@select-workbench-panel="selectWorkbenchPanel"[\s\S]*@toggle-workspace-menu="toggleWorkspaceMenu"/,
  'WorkbenchRail must keep title/menu user intent wired',
)
assert.match(
  railSource,
  /workspaceTitleAreaRef\.value\?\.containsWorkspaceTitleTarget\?\.\(event\.target\)/,
  'WorkbenchRail must use the title area exposed target boundary for outside-click handling',
)
assert.doesNotMatch(
  railSource,
  /<div class="workbench-rail-center"|<div v-if="workspaceMenuOpen" class="workbench-mode-menu"/,
  'WorkbenchRail must not render center title or mode menu DOM directly',
)

for (const className of [
  'workbench-rail-center',
  'workbench-rail-title-target',
  'workbench-rail-title-slot',
  'workbench-rail-document-title',
  'workbench-rail-document-title-label',
  'workbench-rail-workspace-title',
  'workbench-rail-workspace-title-button',
  'workbench-rail-workspace-title-label',
  'workbench-rail-workspace-title-chevron',
  'workbench-mode-menu',
  'workbench-mode-menu-section-label',
  'workbench-mode-menu-item',
  'workbench-mode-menu-glyph',
  'workbench-mode-menu-label',
]) {
  assert.doesNotMatch(
    railStyle,
    new RegExp(`\\.${className}\\b`),
    `WorkbenchRail.vue must not own title/menu scoped style .${className}`,
  )
  assert.match(
    titleAreaStyle,
    new RegExp(`\\.${className}\\b`),
    `WorkbenchRailTitleArea.vue must own title/menu scoped style .${className}`,
  )
}

assert.match(
  titleAreaSource,
  /containsWorkspaceTitleTarget\(target\)/,
  'WorkbenchRailTitleArea must expose a narrow outside-click boundary method',
)
assert.doesNotMatch(
  titleAreaSource,
  /isNativeWindowFullscreen|onNativeWindowResized|startNativeWindowDrag|syncMacosWindowTransparency|useWorkspaceStore|useEditorStore|document\.addEventListener|window\.addEventListener/,
  'WorkbenchRailTitleArea must stay presentation-only and avoid native/listener/store authority',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    railUsesTitleAreaComponent: true,
    parentKeepsNativeAndMenuOrchestration: true,
    titleAreaOwnsTitleAndModeMenuStyles: true,
    titleAreaAvoidsNativeAuthority: true,
  },
}, null, 2))
