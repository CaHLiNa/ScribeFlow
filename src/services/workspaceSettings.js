import { invoke } from '@tauri-apps/api/core'
import {
  getDefaultModelsConfig,
  getProviderDefaultUrl,
  mergeRemoteModelsIntoConfig,
  mergeWithDefaultModelsConfig,
  providerSupportsModelSync,
} from './modelCatalog'
import { pathExists } from './pathExists.js'
import { resolveSkillPath } from './workspacePaths'

function parseEnvContent(content = '', options = {}) {
  const { ignorePlaceholders = false } = options
  const result = {}
  for (const line of String(content || '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx <= 0) continue
    const key = trimmed.substring(0, eqIdx).trim()
    const value = trimmed.substring(eqIdx + 1).trim()
    if (!value) continue
    if (ignorePlaceholders && value.includes('your-')) continue
    result[key] = value
  }
  return result
}

function serializeEnvContent(keys = {}) {
  return Object.entries(keys)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

const DEFAULT_AI_RUNTIME_CONFIG = Object.freeze({
  version: 1,
  defaultRuntime: 'legacy',
  profileRuntimes: {
    code_assistant: 'opencode',
  },
  opencode: {
    endpoint: '',
    launchProfile: 'auto',
    devRepoPath: '',
    idleDisposeMs: 2 * 60 * 1000,
    strict: false,
  },
})

function cloneDefaultAiRuntimeConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_AI_RUNTIME_CONFIG))
}

function normalizeProfileRuntimes(value = {}) {
  const result = {}
  for (const [key, runtime] of Object.entries(value || {})) {
    if (!key || !runtime) continue
    result[String(key)] = String(runtime)
  }
  return result
}

function mergeAiRuntimeConfig(value = {}) {
  const defaults = cloneDefaultAiRuntimeConfig()
  return {
    ...defaults,
    ...(value || {}),
    profileRuntimes: {
      ...defaults.profileRuntimes,
      ...normalizeProfileRuntimes(value?.profileRuntimes),
    },
    opencode: {
      ...defaults.opencode,
      ...(value?.opencode || {}),
      endpoint: String(value?.opencode?.endpoint || defaults.opencode.endpoint || ''),
      launchProfile: String(value?.opencode?.launchProfile || defaults.opencode.launchProfile || 'auto'),
      devRepoPath: String(value?.opencode?.devRepoPath || defaults.opencode.devRepoPath || ''),
      idleDisposeMs: Number(value?.opencode?.idleDisposeMs) > 0
        ? Number(value.opencode.idleDisposeMs)
        : defaults.opencode.idleDisposeMs,
      strict: value?.opencode?.strict === true,
    },
  }
}

export function resolveModelsPath(globalConfigDir = '', shouldersDir = '') {
  if (globalConfigDir) return `${globalConfigDir}/models.json`
  if (shouldersDir) return `${shouldersDir}/models.json`
  return ''
}

export async function loadSystemPrompt(shouldersDir = '') {
  if (!shouldersDir) return ''
  try {
    return await invoke('read_file', { path: `${shouldersDir}/system.md` })
  } catch {
    return ''
  }
}

export async function loadWorkspaceSkillsManifest(projectDir = '') {
  if (!projectDir) return null
  try {
    const skillsPath = `${projectDir}/skills/skills.json`
    const exists = await pathExists(skillsPath)
    if (!exists) return null
    const content = await invoke('read_file', { path: skillsPath })
    const data = JSON.parse(content)
    return Array.isArray(data.skills)
      ? data.skills.map(skill => ({
        ...skill,
        path: resolveSkillPath(projectDir, skill.path),
      }))
      : null
  } catch {
    return null
  }
}

export async function loadGlobalKeys(globalConfigDir = '') {
  if (!globalConfigDir) return {}
  const keysPath = `${globalConfigDir}/keys.env`
  try {
    const exists = await pathExists(keysPath)
    if (!exists) return {}
    const content = await invoke('read_file', { path: keysPath })
    return parseEnvContent(content)
  } catch (error) {
    console.warn('Failed to load global keys:', error)
    return {}
  }
}

export async function loadAiRuntimeConfig(globalConfigDir = '') {
  if (!globalConfigDir) return cloneDefaultAiRuntimeConfig()
  const configPath = `${globalConfigDir}/ai-runtime.json`
  try {
    const exists = await pathExists(configPath)
    if (!exists) return cloneDefaultAiRuntimeConfig()
    const content = await invoke('read_file', { path: configPath })
    return mergeAiRuntimeConfig(JSON.parse(content))
  } catch (error) {
    console.warn('Failed to load AI runtime config:', error)
    return cloneDefaultAiRuntimeConfig()
  }
}

export async function saveGlobalKeys(globalConfigDir = '', keys = {}) {
  if (!globalConfigDir) return
  const keysPath = `${globalConfigDir}/keys.env`
  try {
    const content = serializeEnvContent(keys)
    await invoke('write_file', {
      path: keysPath,
      content: content ? `${content}\n` : '',
    })
  } catch (error) {
    console.warn('Failed to save global keys:', error)
  }
}

export async function migrateWorkspaceEnvKeys({ shouldersDir = '', globalConfigDir = '' }) {
  if (!shouldersDir || !globalConfigDir) return {}
  try {
    const envContent = await invoke('read_file', { path: `${shouldersDir}/.env` })
    const workspaceKeys = parseEnvContent(envContent, { ignorePlaceholders: true })
    if (Object.keys(workspaceKeys).length > 0) {
      await saveGlobalKeys(globalConfigDir, workspaceKeys)
    }
    return workspaceKeys
  } catch {
    return {}
  }
}

export async function loadModelsConfig({ globalConfigDir = '', shouldersDir = '' } = {}) {
  try {
    const modelsPath = resolveModelsPath(globalConfigDir, shouldersDir)
    if (!modelsPath) return null
    const modelsContent = await invoke('read_file', { path: modelsPath })
    const { config, changed } = mergeWithDefaultModelsConfig(JSON.parse(modelsContent))
    if (changed) {
      await invoke('write_file', {
        path: modelsPath,
        content: JSON.stringify(config, null, 2),
      })
    }
    return config
  } catch {
    return null
  }
}

export async function saveModelsConfig({ globalConfigDir = '', shouldersDir = '', config = {} } = {}) {
  const modelsPath = resolveModelsPath(globalConfigDir, shouldersDir)
  if (!modelsPath) return null

  const { config: normalized } = mergeWithDefaultModelsConfig(config || {})
  await invoke('write_file', {
    path: modelsPath,
    content: JSON.stringify(normalized, null, 2),
  })
  return normalized
}

export async function syncWorkspaceProviderModels({
  globalConfigDir = '',
  shouldersDir = '',
  modelsConfig = null,
  apiKeys = {},
  providerIds = null,
} = {}) {
  const baseConfig = mergeWithDefaultModelsConfig(modelsConfig || getDefaultModelsConfig()).config
  let nextConfig = baseConfig
  let addedCount = 0
  const syncedProviders = []
  const failedProviders = []

  const targetIds = (Array.isArray(providerIds) && providerIds.length > 0
    ? providerIds
    : Object.keys(nextConfig.providers || {})
  ).filter(providerSupportsModelSync)

  for (const providerId of targetIds) {
    const providerConfig = nextConfig.providers?.[providerId]
    const keyEnv = providerConfig?.apiKeyEnv
    const apiKey = keyEnv ? apiKeys?.[keyEnv] : ''
    if (!apiKey || apiKey.includes('your-')) continue

    const baseUrl = providerConfig?.customUrl || providerConfig?.url || getProviderDefaultUrl(providerId)
    if (!baseUrl) continue

    try {
      const remoteModels = await invoke('model_sync_list_openai_models', {
        baseUrl,
        apiKey,
      })
      const merged = mergeRemoteModelsIntoConfig(
        nextConfig,
        providerId,
        (remoteModels || []).map(entry => entry?.id).filter(Boolean),
      )
      nextConfig = merged.config
      addedCount += merged.addedCount
      syncedProviders.push(providerId)
    } catch (error) {
      failedProviders.push({
        provider: providerId,
        error: error?.message || String(error),
      })
    }
  }

  if (JSON.stringify(nextConfig) !== JSON.stringify(baseConfig)) {
    nextConfig = await saveModelsConfig({
      globalConfigDir,
      shouldersDir,
      config: nextConfig,
    }) || nextConfig
  }

  return {
    config: nextConfig,
    addedCount,
    syncedProviders,
    failedProviders,
  }
}

export async function loadToolPermissions({ globalConfigDir = '', shouldersDir = '' } = {}) {
  if (!globalConfigDir) return []
  const globalPath = `${globalConfigDir}/tools.json`
  try {
    const raw = await invoke('read_file', { path: globalPath })
    const data = JSON.parse(raw)
    return Array.isArray(data.disabled) ? data.disabled : []
  } catch {
    if (!shouldersDir) return []
    try {
      const localRaw = await invoke('read_file', { path: `${shouldersDir}/tools.json` })
      const localData = JSON.parse(localRaw)
      const disabledTools = Array.isArray(localData.disabled) ? localData.disabled : []
      await saveToolPermissions({ globalConfigDir, disabledTools })
      return disabledTools
    } catch {
      return []
    }
  }
}

export async function saveToolPermissions({ globalConfigDir = '', disabledTools = [] } = {}) {
  if (!globalConfigDir) return
  try {
    await invoke('write_file', {
      path: `${globalConfigDir}/tools.json`,
      content: JSON.stringify({ version: 1, disabled: disabledTools }, null, 2),
    })
  } catch (error) {
    console.warn('Failed to save tool permissions:', error)
  }
}
