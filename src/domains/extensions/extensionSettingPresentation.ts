function normalizeText(value = '') {
  return String(value || '').trim()
}

export function shortExtensionSettingKey(key = '') {
  const normalized = normalizeText(key)
  return normalized.split('.').pop() || normalized
}

export function secureSettingInputType(key = '', setting = {}) {
  if (setting?.secureStorage === true) {
    return 'password'
  }
  const normalized = shortExtensionSettingKey(key).toLowerCase()
  if (
    normalized.includes('key') ||
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('password')
  ) {
    return 'password'
  }
  if (setting?.type === 'number' || setting?.type === 'integer') return 'number'
  return 'text'
}
