import test from 'node:test'
import assert from 'node:assert/strict'

import { locale, resolveMessageKey, t } from '../src/i18n/index.js'

test('i18n resolves legacy key aliases to canonical keys', () => {
  assert.equal(resolveMessageKey('Sync now'), 'Sync Now')
  assert.equal(resolveMessageKey('PDF viewer'), 'PDF Viewer')
  assert.equal(resolveMessageKey('Toggle Sidebar'), 'Toggle sidebar')
  assert.equal(resolveMessageKey('Zoom In'), 'Zoom in')
})

test('i18n alias keys return the same zh-CN translation as canonical keys', () => {
  const previousLocale = locale.value
  locale.value = 'zh-CN'

  try {
    assert.equal(t('Sync now'), t('Sync Now'))
    assert.equal(t('PDF viewer'), t('PDF Viewer'))
    assert.equal(t('open file'), t('Open file'))
    assert.equal(t('new tab'), t('New Tab'))
  } finally {
    locale.value = previousLocale
  }
})
