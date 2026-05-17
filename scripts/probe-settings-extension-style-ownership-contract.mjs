import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const settingsShellSource = await readFile('src/components/settings/SettingsExtensions.vue', 'utf8')
const settingsListSource = await readFile('src/components/settings/SettingsExtensionList.vue', 'utf8')
const settingsOptionsSource = await readFile('src/components/settings/SettingsExtensionOptions.vue', 'utf8')

function scopedStyleBlock(source = '') {
  return source.match(/<style scoped>[\s\S]*?<\/style>/)?.[0] || ''
}

const shellStyle = scopedStyleBlock(settingsShellSource)
const listStyle = scopedStyleBlock(settingsListSource)
const optionsStyle = scopedStyleBlock(settingsOptionsSource)

assert.match(
  settingsShellSource,
  /import SettingsExtensionList from '\.\/SettingsExtensionList\.vue'/,
  'SettingsExtensions must render extension list through the list presentation component',
)
assert.match(
  settingsShellSource,
  /import SettingsExtensionOptions from '\.\/SettingsExtensionOptions\.vue'/,
  'SettingsExtensions must render extension options through the options presentation component',
)
assert.match(
  shellStyle,
  /\.extensions-page\s*\{/,
  'SettingsExtensions may keep page-level shell spacing styles',
)
assert.doesNotMatch(
  shellStyle,
  /\.extension-card\s*\{/,
  'SettingsExtensions must not own scoped styles for child extension cards',
)
assert.doesNotMatch(
  shellStyle,
  /\.extension-setting-row\s*\{/,
  'SettingsExtensions must not own scoped styles for child extension option rows',
)
assert.doesNotMatch(
  shellStyle,
  /\.extensions-group-heading\s*\{/,
  'SettingsExtensions must not own scoped styles for child section headings',
)
assert.doesNotMatch(
  shellStyle,
  /\.extension-host-runtime/,
  'SettingsExtensions must not keep stale host runtime card styles',
)

assert.match(
  listStyle,
  /\.extension-card\s*\{/,
  'SettingsExtensionList must own loaded extension card styles',
)
assert.match(
  listStyle,
  /\.extension-header\s*\{/,
  'SettingsExtensionList must own loaded extension row layout',
)
assert.match(
  listStyle,
  /\.extensions-page-icon-button\s*\{/,
  'SettingsExtensionList must own loaded extension header action styles',
)
assert.match(
  listStyle,
  /\.extension-controls\s*\{/,
  'SettingsExtensionList must own loaded extension controls layout',
)

assert.match(
  optionsStyle,
  /\.extension-card-icon-button\s*\{/,
  'SettingsExtensionOptions must own its back-button icon style',
)
assert.match(
  optionsStyle,
  /\.extension-setting-row\s*\{/,
  'SettingsExtensionOptions must own option row layout',
)
assert.match(
  optionsStyle,
  /\.extension-setting-control\s*\{/,
  'SettingsExtensionOptions must own option control sizing',
)
assert.match(
  optionsStyle,
  /\.extension-setting-textarea\s*\{/,
  'SettingsExtensionOptions must own long-text option styles',
)
assert.match(
  optionsStyle,
  /\.extension-action-control\s*\{/,
  'SettingsExtensionOptions must own action control layout',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    shellKeepsOnlyPageStyles: true,
    listOwnsCardStyles: true,
    optionsOwnOptionStyles: true,
    staleHostRuntimeStylesRemoved: true,
  },
}, null, 2))
