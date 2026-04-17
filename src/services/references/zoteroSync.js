import { invoke } from '@tauri-apps/api/core'

const ZOTERO_KEYCHAIN_KEY = 'zotero-api-key'

export const zoteroSyncState = {
  status: 'disconnected',
  lastSyncTime: null,
  error: null,
  errorType: null,
  progress: null,
}

function setSyncState(partial = {}) {
  Object.assign(zoteroSyncState, partial)
}

function classifyError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  if (message.includes('auth')) return 'auth'
  if (message.includes('rate-limit') || message.includes('retry after')) return 'rate-limit'
  if (/timeout|network|resolve|connect/.test(message)) return 'network'
  return 'generic'
}

async function getGlobalConfigDir() {
  return invoke('get_global_config_dir')
}

function resolveConfigPath(globalConfigDir = '') {
  return `${String(globalConfigDir || '').replace(/\/+$/, '')}/zotero.json`
}

async function readZoteroConfigRaw(globalConfigDir = null) {
  try {
    const resolvedDir = globalConfigDir || await getGlobalConfigDir()
    const content = await invoke('read_file', { path: resolveConfigPath(resolvedDir) })
    return JSON.parse(content)
  } catch {
    return null
  }
}

async function writeZoteroConfigRaw(config = null, globalConfigDir = null) {
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

export async function storeZoteroApiKey(apiKey = '') {
  const raw = (await readZoteroConfigRaw()) || {}

  await writeZoteroConfigRaw({
    ...raw,
    _apiKeyFallback: apiKey,
    _credentialStorage: 'mirrored-file-fallback',
  })

  try {
    await invoke('keychain_set', { key: ZOTERO_KEYCHAIN_KEY, value: apiKey })
  } catch {
    localStorage.setItem('zoteroApiKey', apiKey)
  }
}

export async function loadZoteroApiKey() {
  try {
    const value = await invoke('keychain_get', { key: ZOTERO_KEYCHAIN_KEY })
    if (value) return value
  } catch {
    // fall through
  }

  const rawConfig = await readZoteroConfigRaw()
  const fileFallback = String(rawConfig?._apiKeyFallback || '').trim()
  if (fileFallback) return fileFallback

  const fallback = localStorage.getItem('zoteroApiKey')
  if (fallback) return fallback
  return null
}

export async function clearZoteroApiKey() {
  await invoke('keychain_delete', { key: ZOTERO_KEYCHAIN_KEY }).catch(() => {})
  const raw = await readZoteroConfigRaw()
  if (raw && (raw._apiKeyFallback || raw._credentialStorage)) {
    const next = { ...raw }
    delete next._apiKeyFallback
    delete next._credentialStorage
    await writeZoteroConfigRaw(next)
  }
  localStorage.removeItem('zoteroApiKey')
}

export async function disconnectZotero() {
  await clearZoteroApiKey()
  const globalConfigDir = await getGlobalConfigDir()
  await saveZoteroConfig(null, globalConfigDir)
  setSyncState({
    status: 'disconnected',
    lastSyncTime: null,
    error: null,
    errorType: null,
    progress: null,
  })
}

export async function loadZoteroConfig(globalConfigDir = null) {
  const resolvedDir = globalConfigDir || await getGlobalConfigDir()
  const config = await invoke('references_zotero_config_load', {
    params: {
      globalConfigDir: resolvedDir,
    },
  })
  return config && typeof config === 'object' ? config : null
}

export async function saveZoteroConfig(config = null, globalConfigDir = null) {
  const resolvedDir = globalConfigDir || await getGlobalConfigDir()
  return invoke('references_zotero_config_save', {
    params: {
      globalConfigDir: resolvedDir,
      config,
    },
  })
}

export async function validateApiKey(apiKey = '') {
  return invoke('references_zotero_validate_api_key', {
    params: {
      apiKey,
    },
  })
}

export async function fetchUserGroups(apiKey = '', userId = '') {
  return invoke('references_zotero_fetch_user_groups', {
    params: {
      apiKey,
      userId,
    },
  })
}

export async function fetchCollections(apiKey = '', libraryType = 'user', libraryId = '') {
  return invoke('references_zotero_fetch_collections', {
    params: {
      apiKey,
      libraryType,
      libraryId,
    },
  })
}

export async function deleteFromZotero(reference = {}) {
  const globalConfigDir = await getGlobalConfigDir()
  const apiKey = await loadZoteroApiKey()
  if (!apiKey) return

  await invoke('references_zotero_delete_item', {
    params: {
      globalConfigDir,
      apiKey,
      reference,
    },
  }).catch(() => {})
}

export async function syncNow(projectRoot = '', referencesStore) {
  const [config, apiKey] = await Promise.all([
    loadZoteroConfig(projectRoot),
    loadZoteroApiKey(),
  ])
  if (!config || !apiKey) {
    setSyncState({ status: 'disconnected', error: null, errorType: null, progress: null })
    return { imported: 0, linked: 0, updated: 0 }
  }

  setSyncState({ status: 'syncing', error: null, errorType: null, progress: null })

  try {
    const result = await invoke('references_zotero_sync', {
      params: {
        globalConfigDir: projectRoot,
        apiKey,
        references: referencesStore.references,
        selectedReferenceId: referencesStore.selectedReferenceId,
      },
    })

    referencesStore.applyLibrarySnapshot({
      version: 2,
      citationStyle: referencesStore.citationStyle,
      collections: referencesStore.collections,
      tags: referencesStore.tags,
      references: Array.isArray(result?.references) ? result.references : [],
    })
    if (result?.selectedReferenceId) {
      referencesStore.selectedReferenceId = result.selectedReferenceId
    }
    await referencesStore.persistLibrarySnapshot(projectRoot)

    setSyncState({
      status: 'synced',
      lastSyncTime: result?.lastSyncTime || new Date().toISOString(),
      error: null,
      errorType: null,
      progress: null,
    })
    return {
      imported: Number(result?.imported || 0),
      linked: Number(result?.linked || 0),
      updated: Number(result?.updated || 0),
    }
  } catch (error) {
    setSyncState({
      status: 'error',
      error: error?.message || String(error),
      errorType: classifyError(error),
      progress: null,
    })
    throw error
  }
}
