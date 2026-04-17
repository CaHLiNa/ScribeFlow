import { invoke } from '@tauri-apps/api/core'

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

export async function storeZoteroApiKey(apiKey = '') {
  const globalConfigDir = await getGlobalConfigDir()
  await invoke('references_zotero_api_key_store', {
    params: {
      globalConfigDir,
      apiKey,
    },
  })
}

export async function loadZoteroApiKey() {
  const globalConfigDir = await getGlobalConfigDir()
  const value = await invoke('references_zotero_api_key_load', {
    params: {
      globalConfigDir,
    },
  })
  return typeof value === 'string' && value.trim() ? value : null
}

export async function clearZoteroApiKey() {
  const globalConfigDir = await getGlobalConfigDir()
  await invoke('references_zotero_api_key_clear', {
    params: {
      globalConfigDir,
    },
  })
}

export async function disconnectZotero() {
  const globalConfigDir = await getGlobalConfigDir()
  await invoke('references_zotero_disconnect', {
    params: {
      globalConfigDir,
    },
  })
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
