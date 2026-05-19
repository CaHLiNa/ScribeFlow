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
  'WorkbenchRail must render title presentation through WorkbenchRailTitleArea',
)
assert.match(
  railSource,
  /<WorkbenchRailTitleArea[\s\S]*:rail-title-state="railTitleState"/,
  'WorkbenchRail must pass title presentation state into WorkbenchRailTitleArea',
)
assert.match(
  railSource,
  /v-for="item in workbenchModeItems"/,
  'WorkbenchRail must own first-class workbench mode navigation outside the title area',
)
assert.doesNotMatch(
  railSource,
  /workspaceMenuOpen|toggleWorkspaceMenu|selectWorkbenchPanel/,
  'WorkbenchRail must not keep the old title-menu mode switcher orchestration',
)

for (const className of [
  'workbench-rail-center',
  'workbench-rail-title-target',
  'workbench-rail-title-slot',
  'workbench-rail-document-title',
  'workbench-rail-document-title-label',
  'workbench-rail-context-title',
  'workbench-rail-context-title-label',
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
  /railTitleState\.showContextTitle/,
  'WorkbenchRailTitleArea must render context titles from presentation state',
)
assert.doesNotMatch(
  titleAreaSource,
  /isNativeWindowFullscreen|onNativeWindowResized|startNativeWindowDrag|syncMacosWindowTransparency|useWorkspaceStore|useEditorStore|document\.addEventListener|window\.addEventListener|workspaceMenuOpen|workbench-mode-menu/,
  'WorkbenchRailTitleArea must stay presentation-only and avoid native/listener/store authority',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    railUsesTitleAreaComponent: true,
    parentKeepsNativeAndModeOrchestration: true,
    titleAreaOwnsTitleStyles: true,
    titleAreaAvoidsNativeAuthority: true,
  },
}, null, 2))
