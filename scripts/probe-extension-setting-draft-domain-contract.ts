import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  extensionSettingDraftKey,
  extensionSettingDraftValue,
  hasPersistedSecureExtensionSetting,
  parseExtensionSettingDraftKey,
} from '../src/domains/extensions/extensionSettingDrafts.ts'

const extension = {
  id: 'Example-PDF-Extension',
  settingsSchema: {
    'examplePdfExtension.apiKey': {
      secureStorage: true,
    },
    'examplePdfExtension.targetLang': {
      secureStorage: false,
    },
  },
}

assert.equal(
  extensionSettingDraftKey(' Example-PDF-Extension ', ' examplePdfExtension.apiKey '),
  'example-pdf-extension::examplePdfExtension.apiKey',
)
assert.equal(extensionSettingDraftKey('', 'examplePdfExtension.apiKey'), '')
assert.equal(extensionSettingDraftKey('example-pdf-extension', ''), '')

assert.deepEqual(
  parseExtensionSettingDraftKey('example-pdf-extension::nested::setting'),
  {
    extensionId: 'example-pdf-extension',
    key: 'nested::setting',
  },
)

assert.equal(
  extensionSettingDraftValue({
    extension,
    key: 'examplePdfExtension.apiKey',
    settingDrafts: {
      'example-pdf-extension::examplePdfExtension.apiKey': 'sk-draft',
    },
    savedSecureSettingDrafts: {
      'example-pdf-extension::examplePdfExtension.apiKey': 'sk-saved-draft',
    },
    persistedValue: 'sk-persisted',
  }),
  'sk-draft',
)
assert.equal(
  extensionSettingDraftValue({
    extension,
    key: 'examplePdfExtension.apiKey',
    settingDrafts: {},
    savedSecureSettingDrafts: {
      'example-pdf-extension::examplePdfExtension.apiKey': 'sk-saved-draft',
    },
    persistedValue: 'sk-persisted',
  }),
  'sk-saved-draft',
)
assert.equal(
  extensionSettingDraftValue({
    extension,
    key: 'examplePdfExtension.targetLang',
    settingDrafts: {},
    savedSecureSettingDrafts: {},
    persistedValue: 'zh-CN',
  }),
  'zh-CN',
)

assert.equal(
  hasPersistedSecureExtensionSetting({
    extension,
    key: 'examplePdfExtension.apiKey',
    persistedValue: 'sk-persisted',
  }),
  true,
)
assert.equal(
  hasPersistedSecureExtensionSetting({
    extension,
    key: 'examplePdfExtension.apiKey',
    persistedValue: '',
  }),
  false,
)
assert.equal(
  hasPersistedSecureExtensionSetting({
    extension,
    key: 'examplePdfExtension.targetLang',
    persistedValue: 'zh-CN',
  }),
  false,
)

const componentSource = await readFile('src/components/settings/SettingsExtensions.vue', 'utf8')
assert.match(
  componentSource,
  /from '..\/..\/domains\/extensions\/extensionSettingDrafts'/,
  'SettingsExtensions must use the pure setting draft domain helper',
)
assert.doesNotMatch(
  componentSource,
  /function settingDraftKey\(/,
  'SettingsExtensions must not own setting draft key construction',
)
assert.doesNotMatch(
  componentSource,
  /split\('::'\)/,
  'SettingsExtensions must not parse setting draft keys inline',
)
assert.doesNotMatch(
  componentSource,
  /settingsSchema\?\.\[key\][\s\S]{0,120}secureStorage/,
  'SettingsExtensions must not own secure setting persistence display policy',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    draftKeyNormalized: true,
    draftValuePrecedence: true,
    securePersistencePolicyInDomain: true,
    componentUsesDomainHelper: true,
  },
}, null, 2))
