import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const panelSource = await readFile('src/components/extensions/ExtensionSidebarPanel.vue', 'utf8')
const headerSource = await readFile('src/components/extensions/ExtensionSidebarHeader.vue', 'utf8')
const sectionSource = await readFile('src/components/extensions/ExtensionSidebarViewSection.vue', 'utf8')

function scopedStyleBlock(source = '') {
  return source.match(/<style scoped>[\s\S]*?<\/style>/)?.[0] || ''
}

const panelStyle = scopedStyleBlock(panelSource)
const headerStyle = scopedStyleBlock(headerSource)
const sectionStyle = scopedStyleBlock(sectionSource)

assert.match(
  panelSource,
  /import ExtensionSidebarHeader from '\.\/ExtensionSidebarHeader\.vue'/,
  'ExtensionSidebarPanel must render header chrome through the header presentation component',
)
assert.match(
  panelSource,
  /import ExtensionSidebarViewSection from '\.\/ExtensionSidebarViewSection\.vue'/,
  'ExtensionSidebarPanel must render view sections through the section presentation component',
)
assert.match(
  panelSource,
  /<ExtensionSidebarHeader[\s\S]*@refresh="refreshViews"[\s\S]*@run-action="runHeaderAction"/,
  'ExtensionSidebarPanel must keep header orchestration callbacks wired through the header child',
)
assert.match(
  panelSource,
  /<ExtensionSidebarViewSection[\s\S]*@open-result-entry="openResultEntry"[\s\S]*@toggle-item-expansion="toggleItemExpansion"/,
  'ExtensionSidebarPanel must keep view-section orchestration callbacks wired through the section child',
)

for (const className of [
  'extension-sidebar-panel',
  'extension-sidebar-panel__views',
  'extension-sidebar-panel__empty',
]) {
  assert.match(
    panelStyle,
    new RegExp(`\\.${className}\\b`),
    `ExtensionSidebarPanel may keep shell style .${className}`,
  )
}

for (const className of [
  'extension-sidebar-panel__header',
  'extension-sidebar-panel__header-actions',
  'extension-sidebar-panel__header-main',
  'extension-sidebar-panel__title',
  'extension-sidebar-panel__meta',
  'extension-sidebar-panel__refresh',
  'extension-sidebar-panel__tree',
  'extension-sidebar-panel__section',
  'extension-sidebar-panel__section-header',
  'extension-sidebar-panel__view-message',
  'extension-sidebar-panel__status',
  'extension-sidebar-panel__status-action',
  'extension-sidebar-panel__summary',
  'extension-sidebar-panel__results',
  'extension-sidebar-panel__results-title',
  'extension-sidebar-panel__result-entry',
  'extension-sidebar-panel__result-label',
  'extension-sidebar-panel__result-description',
  'extension-sidebar-panel__view-meta',
]) {
  assert.doesNotMatch(
    panelStyle,
    new RegExp(`\\.${className}\\b`),
    `ExtensionSidebarPanel must not own child scoped style .${className}`,
  )
}

for (const className of [
  'extension-sidebar-panel__header',
  'extension-sidebar-panel__header-actions',
  'extension-sidebar-panel__header-main',
  'extension-sidebar-panel__title',
  'extension-sidebar-panel__meta',
  'extension-sidebar-panel__refresh',
]) {
  assert.match(
    headerStyle,
    new RegExp(`\\.${className}\\b`),
    `ExtensionSidebarHeader must own header scoped style .${className}`,
  )
}

for (const className of [
  'extension-sidebar-panel__tree',
  'extension-sidebar-panel__section',
  'extension-sidebar-panel__section-header',
  'extension-sidebar-panel__view-message',
  'extension-sidebar-panel__status',
  'extension-sidebar-panel__status-action',
  'extension-sidebar-panel__summary',
  'extension-sidebar-panel__results',
  'extension-sidebar-panel__results-title',
  'extension-sidebar-panel__result-entry',
  'extension-sidebar-panel__result-label',
  'extension-sidebar-panel__result-description',
  'extension-sidebar-panel__view-meta',
]) {
  assert.match(
    sectionStyle,
    new RegExp(`\\.${className}\\b`),
    `ExtensionSidebarViewSection must own section scoped style .${className}`,
  )
}

assert.match(
  headerSource,
  /ExtensionBlockedActionButton/,
  'ExtensionSidebarHeader must own blocked header action rendering',
)
assert.doesNotMatch(
  sectionStyle,
  /\.extension-sidebar-panel__header\b/,
  'ExtensionSidebarViewSection must not own header styles',
)
assert.doesNotMatch(
  headerStyle,
  /\.extension-sidebar-panel__section\b/,
  'ExtensionSidebarHeader must not own view-section styles',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    panelOwnsOnlySidebarShellStyles: true,
    headerOwnsHeaderStyles: true,
    sectionOwnsViewSectionStyles: true,
    parentKeepsSidebarOrchestration: true,
  },
}, null, 2))
