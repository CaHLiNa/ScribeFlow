import { invoke } from '@tauri-apps/api/core'

const LEGACY_AI_KEYCHAIN_KEY = 'ai-api-key'
const LEGACY_AI_LOCAL_STORAGE_KEY = 'aiApiKey'

const AI_KEYCHAIN_KEYS = Object.freeze({
  anthropic: 'ai-api-key-anthropic',
  openai: 'ai-api-key-openai',
  google: 'ai-api-key-google',
  deepseek: 'ai-api-key-deepseek',
  glm: 'ai-api-key-glm',
  kimi: 'ai-api-key-kimi',
  minimax: 'ai-api-key-minimax',
  custom: 'ai-api-key-custom',
})

function normalizeProviderId(providerId = 'openai') {
  const normalized = String(providerId || '').trim().toLowerCase()
  if (!normalized) return 'openai'
  if (normalized === 'openai-compatible') return 'openai'
  return AI_KEYCHAIN_KEYS[normalized] ? normalized : 'custom'
}

function resolveAiLocalStorageKey(providerId = 'openai') {
  return `aiApiKey:${normalizeProviderId(providerId)}`
}

export function resolveAiKeychainKey(providerId = 'openai') {
  return AI_KEYCHAIN_KEYS[normalizeProviderId(providerId)] || AI_KEYCHAIN_KEYS.custom
}

async function migrateLegacyOpenAiKeychainValue() {
  try {
    const legacyValue = await invoke('keychain_get', { key: LEGACY_AI_KEYCHAIN_KEY })
    if (!legacyValue) return null
    await invoke('keychain_set', {
      key: resolveAiKeychainKey('openai'),
      value: legacyValue,
    }).catch(() => {})
    await invoke('keychain_delete', { key: LEGACY_AI_KEYCHAIN_KEY }).catch(() => {})
    return legacyValue
  } catch {
    return null
  }
}

async function persistAiCredentialFallback(providerId = 'openai', apiKey = '', credentialStorage = '') {
  const rawConfig = await invoke('ai_config_load_internal')
  const normalizedProviderId = normalizeProviderId(providerId)
  const nextFallbacks = { ...(rawConfig?._apiKeyFallbacks || {}) }
  const nextStorage = { ...(rawConfig?._credentialStorage || {}) }
  const trimmedKey = String(apiKey || '').trim()

  if (trimmedKey) {
    nextFallbacks[normalizedProviderId] = trimmedKey
    nextStorage[normalizedProviderId] = credentialStorage || 'mirrored-file-fallback'
  } else {
    delete nextFallbacks[normalizedProviderId]
    delete nextStorage[normalizedProviderId]
  }

  await invoke('ai_config_save_internal', {
    config: {
      ...(rawConfig || {}),
      _apiKeyFallbacks: nextFallbacks,
      _credentialStorage: nextStorage,
    },
  })
}

export async function listAiProviderDefinitions() {
  const response = await invoke('ai_provider_catalog_list')
  return Array.isArray(response?.providers) ? response.providers : []
}

export async function resolveAiProviderState(
  providerId = 'openai',
  providerConfig = {},
  apiKey = ''
) {
  return invoke('ai_provider_state_resolve', {
    providerId,
    providerConfig,
    apiKey,
  })
}

export async function listAiProviderModels(
  providerId = 'openai',
  providerConfig = {},
  apiKey = ''
) {
  const response = await invoke('ai_provider_models_list', {
    providerId,
    providerConfig,
    apiKey,
  })
  return Array.isArray(response?.options) ? response.options : []
}

export async function testAiProviderConnection(
  providerId = 'openai',
  providerConfig = {},
  apiKey = ''
) {
  return invoke('ai_provider_connection_test', {
    providerId,
    providerConfig,
    apiKey,
  })
}

export async function storeAiApiKey(providerId = 'openai', apiKey = '') {
  const normalizedProviderId = normalizeProviderId(providerId)
  const trimmedKey = String(apiKey || '').trim()

  if (!trimmedKey) {
    await clearAiApiKey(normalizedProviderId)
    return
  }

  await persistAiCredentialFallback(normalizedProviderId, trimmedKey, 'mirrored-file-fallback')

  try {
    await invoke('keychain_set', {
      key: resolveAiKeychainKey(normalizedProviderId),
      value: trimmedKey,
    })
  } catch {
    localStorage.setItem(resolveAiLocalStorageKey(normalizedProviderId), trimmedKey)
    if (normalizedProviderId === 'openai') {
      localStorage.setItem(LEGACY_AI_LOCAL_STORAGE_KEY, trimmedKey)
    }
  }
}

export async function loadAiApiKey(providerId = 'openai') {
  const normalizedProviderId = normalizeProviderId(providerId)

  try {
    const keychainValue = await invoke('keychain_get', {
      key: resolveAiKeychainKey(normalizedProviderId),
    })
    if (keychainValue) return keychainValue
  } catch {
    // fall through
  }

  if (normalizedProviderId === 'openai') {
    const migratedLegacyValue = await migrateLegacyOpenAiKeychainValue()
    if (migratedLegacyValue) return migratedLegacyValue
  }

  const rawConfig = await invoke('ai_config_load_internal')
  const fileFallback = String(rawConfig?._apiKeyFallbacks?.[normalizedProviderId] || '').trim()
  if (fileFallback) return fileFallback

  const localStorageValue = localStorage.getItem(resolveAiLocalStorageKey(normalizedProviderId))
  if (localStorageValue) return localStorageValue

  if (normalizedProviderId === 'openai') {
    const legacyStorageValue = localStorage.getItem(LEGACY_AI_LOCAL_STORAGE_KEY)
    if (legacyStorageValue) {
      localStorage.setItem(resolveAiLocalStorageKey('openai'), legacyStorageValue)
      return legacyStorageValue
    }
  }

  return null
}

export async function clearAiApiKey(providerId = 'openai') {
  const normalizedProviderId = normalizeProviderId(providerId)
  await invoke('keychain_delete', {
    key: resolveAiKeychainKey(normalizedProviderId),
  }).catch(() => {})

  if (normalizedProviderId === 'openai') {
    await invoke('keychain_delete', { key: LEGACY_AI_KEYCHAIN_KEY }).catch(() => {})
  }

  await persistAiCredentialFallback(normalizedProviderId, '', '')
  localStorage.removeItem(resolveAiLocalStorageKey(normalizedProviderId))
  if (normalizedProviderId === 'openai') {
    localStorage.removeItem(LEGACY_AI_LOCAL_STORAGE_KEY)
  }
}

export async function loadAiConfig() {
  return invoke('ai_config_load')
}

export async function saveAiConfig(config = null) {
  await invoke('ai_config_save', {
    config: config || {},
  })
}

export async function setCurrentAiProvider(providerId = 'openai') {
  const config = await loadAiConfig()
  const nextConfig = {
    ...(config || {}),
    currentProviderId: normalizeProviderId(providerId),
  }
  await saveAiConfig(nextConfig)
  return nextConfig
}
