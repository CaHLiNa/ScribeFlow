import test from 'node:test'
import assert from 'node:assert/strict'

import { SETTINGS_SECTION_DEFINITIONS } from '../src/components/settings/settingsSections.js'

test('settings sections expose zotero entry', () => {
  assert.ok(SETTINGS_SECTION_DEFINITIONS.some((section) => section.id === 'zotero'))
})
