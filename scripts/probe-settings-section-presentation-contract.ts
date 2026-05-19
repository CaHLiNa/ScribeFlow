import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createPinia } from 'pinia'
import { createLogger, createServer } from 'vite'
import {
  SETTINGS_SECTION_DEFINITIONS,
  buildSettingsSectionItems,
  normalizeSettingsSectionId,
  resolveSettingsSectionId,
  resolveSettingsSectionMeta,
} from '../src/domains/settings/settingsSections.ts'

assert.deepEqual(
  SETTINGS_SECTION_DEFINITIONS.map((item) => item.id),
  ['general', 'editor', 'zotero', 'system', 'extensions', 'updates'],
)
assert.equal(normalizeSettingsSectionId(''), 'general')
assert.equal(normalizeSettingsSectionId(' environment '), 'system')
assert.equal(resolveSettingsSectionId('unknown'), 'general')
assert.equal(resolveSettingsSectionId('zotero'), 'zotero')

const iconRegistry = {
  adjustments: 'adjustments-icon',
  edit: 'edit-icon',
}
const sectionItems = buildSettingsSectionItems({
  translate: (key) => `t:${key}`,
  iconRegistry,
})
assert.equal(sectionItems[0].label, 't:General')
assert.equal(sectionItems[0].description, 't:Everyday app preferences, fonts, theme, and editor sizing.')
assert.equal(sectionItems[0].icon, 'adjustments-icon')
assert.equal(sectionItems[1].icon, 'edit-icon')
assert.equal(sectionItems[2].icon, null)

assert.deepEqual(
  resolveSettingsSectionMeta({
    sectionId: 'environment',
    translate: (key) => `t:${key}`,
  }),
  {
    activeSection: 'system',
    activeSectionMeta: {
      id: 'system',
      labelKey: 'Environment',
      descriptionKey: 'LaTeX compilers, engines, downloads, and diagnostics.',
      iconKey: 'cpu',
      componentKey: 'system',
      icon: null,
      label: 't:Environment',
      description: 't:LaTeX compilers, engines, downloads, and diagnostics.',
    },
    sections: sectionItems.map(({ icon, ...item }) => ({
      ...item,
      icon: null,
    })),
  },
)

const settingsSource = await readFile('src/components/settings/Settings.vue', 'utf8')
const settingsSidebarSource = await readFile('src/components/settings/SettingsSidebar.vue', 'utf8')
const workspaceStoreSource = await readFile('src/stores/workspace.ts', 'utf8')

assert.match(
  settingsSource,
  /from '..\/..\/domains\/settings\/settingsSections\.ts'/,
  'Settings.vue must import section policy from the settings domain',
)
assert.match(
  settingsSource,
  /resolveSettingsSectionMeta/,
  'Settings.vue must derive active section metadata through the settings domain',
)
assert.doesNotMatch(
  settingsSource,
  /SETTINGS_SECTION_DEFINITIONS\.map/,
  'Settings.vue must not duplicate section list presentation inline',
)

assert.match(
  settingsSidebarSource,
  /from '..\/..\/domains\/settings\/settingsSections\.ts'/,
  'SettingsSidebar.vue must import section policy from the settings domain',
)
assert.match(
  settingsSidebarSource,
  /buildSettingsSectionItems/,
  'SettingsSidebar.vue must derive section items through the settings domain',
)
assert.doesNotMatch(
  settingsSidebarSource,
  /from '\.\/settingsSections\.ts'/,
  'SettingsSidebar.vue must not import component-local section definitions',
)

assert.match(
  workspaceStoreSource,
  /resolveSettingsSectionId/,
  'workspace store must use domain section normalization for settings routing',
)
assert.doesNotMatch(
  workspaceStoreSource,
  /function normalizeSettingsSectionValue/,
  'workspace store must not duplicate settings section fallback logic',
)

const vite = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  logLevel: 'error',
  customLogger: createLogger('error', {
    customConsole: {
      ...console,
      error(message, ...rest) {
        const rendered = String(message || '')
        if (rendered.includes('WebSocket server error:')) return
        console.error(message, ...rest)
      },
    },
  }),
})

try {
  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.ts')
  const workspace = useWorkspaceStore(createPinia())

  workspace.openSettings('environment')
  assert.equal(workspace.primarySurface, 'settings')
  assert.equal(workspace.settingsOpen, true)
  assert.equal(workspace.settingsSection, 'system')

  workspace.setSettingsSection('unknown')
  assert.equal(workspace.settingsSection, 'general')

  console.log(JSON.stringify({
    ok: true,
    summary: {
      sectionDefinitionsInDomain: true,
      environmentAliasResolved: true,
      sidebarUsesDomainItems: true,
      settingsUsesDomainMeta: true,
      workspaceStoreUsesDomainRouting: true,
    },
  }, null, 2))
} finally {
  await vite.close()
}
