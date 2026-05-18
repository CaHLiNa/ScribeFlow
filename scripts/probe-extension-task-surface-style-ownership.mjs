import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const panelSource = await readFile('src/components/extensions/ExtensionTaskPanel.vue', 'utf8')
const rowSource = await readFile('src/components/extensions/ExtensionTaskRow.vue', 'utf8')
const footerSource = await readFile('src/components/extensions/ExtensionTaskHistoryFooter.vue', 'utf8')

function scopedStyleBlock(source = '') {
  return source.match(/<style scoped>[\s\S]*?<\/style>/)?.[0] || ''
}

const panelStyle = scopedStyleBlock(panelSource)
const rowStyle = scopedStyleBlock(rowSource)
const footerStyle = scopedStyleBlock(footerSource)

assert.match(
  panelSource,
  /import ExtensionTaskRow from '\.\/ExtensionTaskRow\.vue'/,
  'ExtensionTaskPanel must render task rows through the row presentation component',
)
assert.match(
  panelSource,
  /import ExtensionTaskHistoryFooter from '\.\/ExtensionTaskHistoryFooter\.vue'/,
  'ExtensionTaskPanel must render truncated-history footer through the footer presentation component',
)
assert.match(
  panelSource,
  /<ExtensionTaskRow[\s\S]*@run-quick-action="runQuickAction"[\s\S]*@toggle-details="toggleTaskDetails"/,
  'ExtensionTaskPanel must keep orchestration callbacks wired into child task rows',
)
assert.match(
  panelSource,
  /<ExtensionTaskHistoryFooter[\s\S]*@toggle="toggleRecentHistory"/,
  'ExtensionTaskPanel must keep recent-history toggling wired through the footer child',
)

for (const className of [
  'extension-task-panel',
  'extension-task-group',
  'extension-task-group__title',
  'extension-task-group__count',
  'extension-task-empty',
]) {
  assert.match(
    panelStyle,
    new RegExp(`\\.${className}\\b`),
    `ExtensionTaskPanel may keep shell style .${className}`,
  )
}

for (const className of [
  'extension-task-row',
  'extension-task-main',
  'extension-task-title',
  'extension-task-facts',
  'extension-task-detail-toggle',
  'extension-task-details',
  'extension-task-progress',
  'extension-task-time',
  'extension-task-results',
  'extension-task-actions',
  'extension-task-group__footer',
  'extension-task-history-toggle',
]) {
  assert.doesNotMatch(
    panelStyle,
    new RegExp(`\\.${className}\\b`),
    `ExtensionTaskPanel must not own child scoped style .${className}`,
  )
}

for (const className of [
  'extension-task-row',
  'extension-task-main',
  'extension-task-title',
  'extension-task-facts',
  'extension-task-detail-toggle',
  'extension-task-details',
  'extension-task-progress',
  'extension-task-time',
  'extension-task-results',
  'extension-task-actions',
]) {
  assert.match(
    rowStyle,
    new RegExp(`\\.${className}\\b`),
    `ExtensionTaskRow must own row scoped style .${className}`,
  )
}

assert.match(
  rowSource,
  /ExtensionResultPreview/,
  'ExtensionTaskRow must own result preview rendering',
)
assert.match(
  rowSource,
  /ExtensionStatusPill/,
  'ExtensionTaskRow must own row status rendering',
)
assert.match(
  rowSource,
  /ExtensionSummaryCard/,
  'ExtensionTaskRow must own row fact card rendering',
)

for (const className of [
  'extension-task-group__footer',
  'extension-task-history-toggle',
]) {
  assert.match(
    footerStyle,
    new RegExp(`\\.${className}\\b`),
    `ExtensionTaskHistoryFooter must own footer scoped style .${className}`,
  )
}

assert.doesNotMatch(
  rowStyle,
  /\.extension-task-group__footer\b/,
  'ExtensionTaskRow must not own truncated-history footer styles',
)
assert.doesNotMatch(
  footerStyle,
  /\.extension-task-row\b/,
  'ExtensionTaskHistoryFooter must not own task row styles',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    panelOwnsOnlyTaskShellStyles: true,
    rowOwnsTaskRowStyles: true,
    footerOwnsHistoryFooterStyles: true,
    parentKeepsTaskOrchestration: true,
  },
}, null, 2))
