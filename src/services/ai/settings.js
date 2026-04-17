import { invoke } from '@tauri-apps/api/core'
import { AI_TOOL_IDS, normalizeEnabledAiToolIds } from './toolRegistry.js'
import { normalizeAnthropicSdkConfig } from './runtime/anthropicSdkPolicy.js'

const AI_CONFIG_VERSION = 5
const LEGACY_AI_KEYCHAIN_KEY = 'ai-api-key'
const LEGACY_AI_LOCAL_STORAGE_KEY = 'aiApiKey'
const DEFAULT_TEMPERATURE = 0.2

export const AI_PROVIDER_DEFINITIONS = Object.freeze([
  {
    id: 'anthropic',
    label: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-5',
    modelPlaceholder: 'claude-sonnet-4-5',
    baseUrlHint: 'https://api.anthropic.com/v1',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5',
    modelPlaceholder: 'gpt-5',
    baseUrlHint: 'https://api.openai.com/v1',
  },
  {
    id: 'google',
    label: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    modelPlaceholder: 'gemini-2.5-flash',
    baseUrlHint: 'https://generativelanguage.googleapis.com/v1beta/openai',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    modelPlaceholder: 'deepseek-chat',
    baseUrlHint: 'https://api.deepseek.com/v1',
  },
  {
    id: 'glm',
    label: 'GLM',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4.5',
    modelPlaceholder: 'glm-4.5',
    baseUrlHint: 'https://open.bigmodel.cn/api/paas/v4',
  },
  {
    id: 'kimi',
    label: 'Kimi',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2-0711-preview',
    modelPlaceholder: 'kimi-k2-0711-preview',
    baseUrlHint: 'https://api.moonshot.cn/v1',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    defaultBaseUrl: 'https://api.minimax.io/v1',
    defaultModel: 'MiniMax-M1',
    modelPlaceholder: 'MiniMax-M1',
    baseUrlHint: 'https://api.minimax.io/v1',
  },
  {
    id: 'custom',
    label: 'Third-party / Custom',
    defaultBaseUrl: '',
    defaultModel: '',
    modelPlaceholder: 'your-model-id',
    baseUrlHint: 'http://127.0.0.1:8080/v1 or https://your-endpoint/v1',
  },
])

const AI_PROVIDER_DEFINITION_MAP = new Map(
  AI_PROVIDER_DEFINITIONS.map((definition) => [definition.id, Object.freeze({ ...definition })])
)

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

function normalizeBaseUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '')
}

function normalizeModel(value = '') {
  return String(value || '').trim()
}

function normalizeTemperature(value = DEFAULT_TEMPERATURE) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_TEMPERATURE
  return Math.min(1.5, Math.max(0, parsed))
}

function normalizeStringMap(record = null) {
  if (!record || typeof record !== 'object') return {}
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, value]) => [normalizeAiProviderId(key), String(value || '').trim()])
      .filter(([key, value]) => key && value)
  )
}

function sanitizePublicAiConfig(config = null) {
  if (!config || typeof config !== 'object') return null
  const next = {
    version: AI_CONFIG_VERSION,
    currentProviderId: normalizeAiProviderId(config.currentProviderId),
    enabledTools: normalizeEnabledAiToolIds(config.enabledTools),
    providers: {},
  }

  for (const definition of AI_PROVIDER_DEFINITIONS) {
    next.providers[definition.id] = normalizeProviderConfig(
      definition.id,
      config.providers?.[definition.id]
    )
  }

  return next
}

async function getGlobalConfigDir() {
  return invoke('get_global_config_dir')
}

function resolveConfigPath(globalConfigDir = '') {
  return `${String(globalConfigDir || '').replace(/\/+$/, '')}/ai.json`
}

async function readAiConfigRaw(globalConfigDir = null) {
  try {
    const resolvedDir = globalConfigDir || await getGlobalConfigDir()
    const content = await invoke('read_file', { path: resolveConfigPath(resolvedDir) })
    return JSON.parse(content)
  } catch {
    return null
  }
}

async function writeAiConfigRaw(config = null, globalConfigDir = null) {
  const resolvedDir = globalConfigDir || await getGlobalConfigDir()
  const path = resolveConfigPath(resolvedDir)
  if (!config) {
    await invoke('delete_path', { path }).catch(() => {})
    return
  }
  await invoke('write_file', {
    path,
    content: JSON.stringify(config, null, 2),
  })
}

function buildDefaultProviderConfig(providerId = 'openai') {
  const definition = getAiProviderDefinition(providerId)
  const config = {
    providerId: definition.id,
    baseUrl: definition.defaultBaseUrl,
    model: resolveAiProviderModel(definition.id),
    temperature: DEFAULT_TEMPERATURE,
  }

  if (definition.id === 'anthropic') {
    config.sdk = normalizeAnthropicSdkConfig()
  }

  return config
}

function normalizeProviderConfig(providerId = 'openai', config = null) {
  const defaults = buildDefaultProviderConfig(providerId)
  const normalizedProviderId = normalizeAiProviderId(providerId)
  const next = {
    providerId: defaults.providerId,
    baseUrl: normalizeBaseUrl(config?.baseUrl || defaults.baseUrl),
    model: providerUsesAutomaticModel(normalizedProviderId)
      ? defaults.model
      : normalizeModel(config?.model || defaults.model),
    temperature: normalizeTemperature(config?.temperature ?? defaults.temperature),
  }

  if (providerId === 'anthropic') {
    next.sdk = normalizeAnthropicSdkConfig(config?.sdk || config?.anthropicSdk)
  }

  return next
}

function normalizeLegacyProviderId(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'openai'
  if (normalized === 'openai-compatible') return 'openai'
  if (AI_PROVIDER_DEFINITION_MAP.has(normalized)) return normalized
  return 'custom'
}

export function normalizeAiProviderId(value = '') {
  return normalizeLegacyProviderId(value)
}

export function getAiProviderDefinition(providerId = 'openai') {
  return AI_PROVIDER_DEFINITION_MAP.get(normalizeAiProviderId(providerId))
    || AI_PROVIDER_DEFINITION_MAP.get('custom')
}

export function providerUsesAutomaticModel(providerId = 'openai') {
  return getAiProviderDefinition(providerId).id !== 'custom'
}

export function resolveAiProviderModel(providerId = 'openai', providerConfig = null) {
  const normalizedProviderId = normalizeAiProviderId(providerId)
  const definition = getAiProviderDefinition(normalizedProviderId)
  if (providerUsesAutomaticModel(normalizedProviderId)) {
    return normalizeModel(
      providerConfig?.model || definition.defaultModel || definition.modelPlaceholder || ''
    )
  }

  return normalizeModel(providerConfig?.model || '')
}

export function providerRequiresAiApiKey(providerId = 'openai', providerConfig = null) {
  const normalizedProviderId = normalizeAiProviderId(providerId)
  if (normalizedProviderId !== 'anthropic') return true

  const sdkConfig = normalizeAnthropicSdkConfig(providerConfig?.sdk || providerConfig?.anthropicSdk)
  return sdkConfig.runtimeMode !== 'sdk'
}

export function isAiProviderReady(providerId = 'openai', providerConfig = null, apiKey = '') {
  const normalizedProviderId = normalizeAiProviderId(providerId)
  const normalizedConfig = normalizeProviderConfig(normalizedProviderId, providerConfig)

  if (!String(normalizedConfig.baseUrl || '').trim()) return false
  if (!String(normalizedConfig.model || '').trim()) return false
  if (providerRequiresAiApiKey(normalizedProviderId, normalizedConfig)) {
    return !!String(apiKey || '').trim()
  }

  return true
}

export function resolveAiKeychainKey(providerId = 'openai') {
  const normalizedProviderId = normalizeAiProviderId(providerId)
  return AI_KEYCHAIN_KEYS[normalizedProviderId] || AI_KEYCHAIN_KEYS.custom
}

function resolveAiLocalStorageKey(providerId = 'openai') {
  return `aiApiKey:${normalizeAiProviderId(providerId)}`
}

export function createDefaultAiConfig() {
  return sanitizePublicAiConfig({
    currentProviderId: 'openai',
    enabledTools: [...AI_TOOL_IDS],
    providers: Object.fromEntries(
      AI_PROVIDER_DEFINITIONS.map((definition) => [
        definition.id,
        buildDefaultProviderConfig(definition.id),
      ])
    ),
  })
}

export function getAiProviderConfig(config = null, providerId = '') {
  const normalized = sanitizePublicAiConfig(config) || createDefaultAiConfig()
  const resolvedProviderId = normalizeAiProviderId(
    providerId || normalized.currentProviderId
  )
  return normalized.providers[resolvedProviderId]
    || buildDefaultProviderConfig(resolvedProviderId)
}

export function normalizeAiConfig(rawConfig = null) {
  const defaults = createDefaultAiConfig()
  const rawVersion = Number(rawConfig?.version || 0) || 0
  const legacyCurrentProviderId = normalizeAiProviderId(
    rawConfig?.currentProviderId
      || rawConfig?.currentProvider
      || rawConfig?.providerId
      || rawConfig?.provider
      || 'openai'
  )

  const legacyProviderConfig =
    rawConfig && !rawConfig.providers && (
      rawConfig.baseUrl
      || rawConfig.model
      || rawConfig.temperature != null
      || rawConfig.provider
    )
      ? normalizeProviderConfig('openai', rawConfig)
      : null

  const providers = Object.fromEntries(
    AI_PROVIDER_DEFINITIONS.map((definition) => {
      const nextConfig =
        rawConfig?.providers?.[definition.id]
        || (definition.id === 'openai' ? legacyProviderConfig : null)
      return [definition.id, normalizeProviderConfig(definition.id, nextConfig)]
    })
  )

  const credentialStorage = normalizeStringMap(rawConfig?._credentialStorage)
  if (rawConfig?._credentialStorage && typeof rawConfig._credentialStorage === 'string') {
    credentialStorage.openai = String(rawConfig._credentialStorage).trim()
  }

  const apiKeyFallbacks = normalizeStringMap(rawConfig?._apiKeyFallbacks)
  if (rawConfig?._apiKeyFallback) {
    apiKeyFallbacks.openai = String(rawConfig._apiKeyFallback).trim()
  }

  return {
    version: AI_CONFIG_VERSION,
    currentProviderId: legacyCurrentProviderId || defaults.currentProviderId,
    enabledTools:
      rawConfig && rawVersion < AI_CONFIG_VERSION
        ? normalizeEnabledAiToolIds([
            ...normalizeEnabledAiToolIds(rawConfig?.enabledTools),
            'create-workspace-file',
            'write-workspace-file',
            'open-workspace-file',
            'delete-workspace-path',
          ])
        : normalizeEnabledAiToolIds(rawConfig?.enabledTools),
    providers,
    _credentialStorage: credentialStorage,
    _apiKeyFallbacks: apiKeyFallbacks,
  }
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

async function persistAiCredentialFallback(
  providerId = 'openai',
  apiKey = '',
  credentialStorage = ''
) {
  const rawConfig = normalizeAiConfig(await readAiConfigRaw())
  const nextFallbacks = { ...rawConfig._apiKeyFallbacks }
  const nextStorage = { ...rawConfig._credentialStorage }
  const normalizedProviderId = normalizeAiProviderId(providerId)
  const trimmedKey = String(apiKey || '').trim()

  if (trimmedKey) {
    nextFallbacks[normalizedProviderId] = trimmedKey
    nextStorage[normalizedProviderId] = credentialStorage || 'mirrored-file-fallback'
  } else {
    delete nextFallbacks[normalizedProviderId]
    delete nextStorage[normalizedProviderId]
  }

  await writeAiConfigRaw({
    version: AI_CONFIG_VERSION,
    currentProviderId: rawConfig.currentProviderId,
    enabledTools: rawConfig.enabledTools,
    providers: rawConfig.providers,
    _apiKeyFallbacks: nextFallbacks,
    _credentialStorage: nextStorage,
  })
}

export async function storeAiApiKey(providerId = 'openai', apiKey = '') {
  const normalizedProviderId = normalizeAiProviderId(providerId)
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
  const normalizedProviderId = normalizeAiProviderId(providerId)

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

  const rawConfig = normalizeAiConfig(await readAiConfigRaw())
  const fileFallback = String(rawConfig._apiKeyFallbacks?.[normalizedProviderId] || '').trim()
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
  const normalizedProviderId = normalizeAiProviderId(providerId)
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
  const normalized = normalizeAiConfig(await readAiConfigRaw())
  return sanitizePublicAiConfig(normalized) || createDefaultAiConfig()
}

export async function saveAiConfig(config = null) {
  if (!config) {
    await writeAiConfigRaw(null)
    return
  }

  const rawConfig = normalizeAiConfig(await readAiConfigRaw())
  const sanitizedConfig = sanitizePublicAiConfig(config) || createDefaultAiConfig()

  await writeAiConfigRaw({
    version: AI_CONFIG_VERSION,
    currentProviderId: sanitizedConfig.currentProviderId,
    enabledTools: sanitizedConfig.enabledTools,
    providers: sanitizedConfig.providers,
    _apiKeyFallbacks: rawConfig._apiKeyFallbacks,
    _credentialStorage: rawConfig._credentialStorage,
  })
}

export async function setCurrentAiProvider(providerId = 'openai') {
  const config = await loadAiConfig()
  const nextConfig = {
    ...config,
    currentProviderId: normalizeAiProviderId(providerId),
  }
  await saveAiConfig(nextConfig)
  return nextConfig
}
