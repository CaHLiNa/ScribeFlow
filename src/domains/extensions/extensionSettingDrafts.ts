function normalizeExtensionId(extensionId = '') {
  return String(extensionId || '').trim().toLowerCase()
}

function normalizeSettingKey(key = '') {
  return String(key || '').trim()
}

export function extensionSettingDraftKey(extensionId = '', key = '') {
  const normalizedExtensionId = normalizeExtensionId(extensionId)
  const normalizedKey = normalizeSettingKey(key)
  if (!normalizedExtensionId || !normalizedKey) return ''
  return `${normalizedExtensionId}::${normalizedKey}`
}

export function parseExtensionSettingDraftKey(draftKey = '') {
  const [extensionId, ...keyParts] = String(draftKey || '').split('::')
  return {
    extensionId: normalizeExtensionId(extensionId),
    key: normalizeSettingKey(keyParts.join('::')),
  }
}

export function extensionSettingDraftValue({
  extension = {},
  key = '',
  settingDrafts = {},
  savedSecureSettingDrafts = {},
  persistedValue,
} = {}) {
  const draftKey = extensionSettingDraftKey(extension?.id, key)
  if (draftKey && Object.prototype.hasOwnProperty.call(settingDrafts, draftKey)) {
    return settingDrafts[draftKey]
  }
  if (draftKey && Object.prototype.hasOwnProperty.call(savedSecureSettingDrafts, draftKey)) {
    return savedSecureSettingDrafts[draftKey]
  }
  return persistedValue
}

export function hasPersistedSecureExtensionSetting({
  extension = {},
  key = '',
  persistedValue,
} = {}) {
  const setting = extension?.settingsSchema?.[key]
  if (setting?.secureStorage !== true) return false
  return String(persistedValue ?? '').trim().length > 0
}
