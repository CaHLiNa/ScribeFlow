import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const settingsSource = await readFile('src/components/settings/Settings.vue', 'utf8')
const surfaceSource = await readFile('src/components/settings/SettingsSurface.vue', 'utf8')

function styleBlocks(source = '') {
  return [...source.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/g)].map((match) => match[0])
}

const settingsStyles = styleBlocks(settingsSource).join('\n')
const surfaceStyles = styleBlocks(surfaceSource).join('\n')

assert.match(
  settingsSource,
  /import SettingsSurface from '\.\/SettingsSurface\.vue'/,
  'Settings.vue must render the settings surface through SettingsSurface',
)
assert.match(
  settingsSource,
  /<SettingsSurface\s+:title="activeSectionLabel">[\s\S]*<component\s+:is="activeSectionComponent"\s+:key="activeSection"\s*\/>[\s\S]*<\/SettingsSurface>/,
  'Settings.vue must keep section component orchestration inside SettingsSurface',
)
assert.equal(
  styleBlocks(settingsSource).length,
  0,
  'Settings.vue must not own settings shell or settings-wide style blocks',
)

for (const className of [
  'settings-surface',
  'settings-header',
  'settings-header-title',
  'settings-content',
  'settings-page',
  'settings-group',
  'settings-group-body',
  'settings-row',
  'settings-row-control',
  'settings-segmented',
]) {
  assert.doesNotMatch(
    settingsStyles,
    new RegExp(`\\.${className}\\b`),
    `Settings.vue must not own .${className} styles`,
  )
  assert.match(
    surfaceStyles,
    new RegExp(`\\.${className}\\b`),
    `SettingsSurface.vue must own .${className} styles`,
  )
}

assert.match(
  surfaceSource,
  /<div class="settings-surface" data-surface-context-guard="true">/,
  'SettingsSurface.vue must own the guarded settings surface root',
)
assert.match(
  surfaceSource,
  /<slot\s*\/>/,
  'SettingsSurface.vue must provide a slot for active section content',
)
assert.equal(
  (surfaceSource.match(/<style\b/g) || []).length,
  2,
  'SettingsSurface.vue must keep one scoped shell style block and one settings-wide style block',
)
assert.equal(
  (surfaceSource.match(/settings-section-title/g) || []).length,
  1,
  'SettingsSurface.vue must keep a single settings-wide section-title rule',
)
assert.doesNotMatch(
  surfaceStyles,
  /letter-spacing:\s*-/,
  'Settings surface typography must not use negative letter spacing',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    settingsUsesSurfaceComponent: true,
    settingsOwnsNoSurfaceStyles: true,
    surfaceOwnsShellAndSharedStyles: true,
    duplicateSettingsWideStyleRemoved: true,
  },
}, null, 2))
