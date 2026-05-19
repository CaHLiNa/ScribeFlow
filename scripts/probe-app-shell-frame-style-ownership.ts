import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const appSource = await readFile('src/App.vue', 'utf8')
const frameSource = await readFile('src/components/layout/AppShellFrame.vue', 'utf8')

function scopedStyleBlock(source = '') {
  return source.match(/<style scoped>[\s\S]*?<\/style>/)?.[0] || ''
}

function cssRuleBlock(source = '', selector = '') {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`))?.[1] || ''
}

const appStyle = scopedStyleBlock(appSource)
const frameStyle = scopedStyleBlock(frameSource)

assert.match(
  appSource,
  /import AppShellFrame from '\.\/components\/layout\/AppShellFrame\.vue'/,
  'App.vue must compose the shell through AppShellFrame',
)
assert.match(
  appSource,
  /<AppShellFrame[\s\S]*@select-workbench-panel="selectWorkbenchPanel"[\s\S]*@toggle-right-sidebar="toggleRightDock"/,
  'App.vue must keep app-level workbench intent wired through AppShellFrame',
)
assert.match(
  appSource,
  /<template #left-sidebar>[\s\S]*<LeftSidebar[\s\S]*<SettingsSidebar/,
  'App.vue must keep left-sidebar surface selection in the shell orchestrator',
)
assert.match(
  appSource,
  /<template #main-workbench>[\s\S]*activeWorkbenchComponent[\s\S]*activeWorkbenchProps/,
  'App.vue must keep active workbench component orchestration',
)
assert.match(
  appSource,
  /<template #overlays>[\s\S]*<ExtensionCommandPalette[\s\S]*<ExtensionWindowPrompt[\s\S]*<ToastContainer/,
  'App.vue must keep overlays composed through the shell frame slot',
)
assert.doesNotMatch(
  appSource,
  /import ResizeHandle|import WorkbenchRail|<style scoped>|<div\s+class="app-shell-root/,
  'App.vue must not own app shell frame DOM, resize handle imports, or scoped shell styles',
)

assert.match(
  frameSource,
  /import ResizeHandle from '\.\/ResizeHandle\.vue'[\s\S]*import WorkbenchRail from '\.\/WorkbenchRail\.vue'/,
  'AppShellFrame must own layout frame children',
)
assert.match(
  frameSource,
  /<slot name="left-sidebar">[\s\S]*<slot name="main-workbench">[\s\S]*<slot name="overlays">/,
  'AppShellFrame must expose left, main, and overlay slots',
)
assert.match(
  frameSource,
  /@resize="\$emit\('left-resize', \$event\)"[\s\S]*@resize-start="\$emit\('left-resize-start'\)"[\s\S]*@resize-end="\$emit\('left-resize-end'\)"/,
  'AppShellFrame must emit resize intent instead of mutating layout state',
)
assert.doesNotMatch(
  frameSource,
  /use[A-Z][A-Za-z]+Store|from '\.\.\/\.\.\/stores\/|invoke\(|@tauri|document\.addEventListener|window\.addEventListener|useAppShellEventBridge|useWorkspaceLifecycle|syncMacosWindowTransparency/,
  'AppShellFrame must stay presentation-only and avoid store, native, service, and listener authority',
)

for (const className of [
  'app-shell-root',
  'app-shell-workspace',
  'app-shell-topbar',
  'app-shell-workbench',
  'app-shell-region',
  'app-shell-region-left',
  'app-shell-sidebar',
  'app-shell-main-card',
  'app-shell-resize-slot',
  'app-shell-resize-handle',
]) {
  assert.doesNotMatch(
    appStyle,
    new RegExp(`\\.${className}\\b`),
    `App.vue must not own app shell scoped style .${className}`,
  )
  assert.match(
    frameStyle,
    new RegExp(`\\.${className}\\b`),
    `AppShellFrame.vue must own app shell scoped style .${className}`,
  )
}

for (const selector of [
  '.app-shell-workbench',
  '.app-shell-sidebar',
  '.app-shell-main-card',
]) {
  const block = cssRuleBlock(frameStyle, selector)
  assert.doesNotMatch(
    block,
    /transform\s*:\s*translateZ\(0\)|will-change\s*:\s*transform|will-change\s*:\s*[^;]*\btransform\b/,
    `${selector} must not keep an idle compositor layer during native window resize`,
  )
}

console.log(JSON.stringify({
  ok: true,
  summary: {
    appOwnsOrchestration: true,
    frameOwnsShellDomAndStyles: true,
    frameAvoidsRuntimeAuthority: true,
    frameAvoidsIdleCompositorLayers: true,
  },
}, null, 2))
