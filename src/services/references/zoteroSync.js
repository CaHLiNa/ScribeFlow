import { invoke } from '@tauri-apps/api/core'
import { getGlobalConfigDir } from '../appDirs.js'

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
  })
}

export async function syncNow(projectRoot = '', options = {}) {
  const apiKey = await loadZoteroApiKey()

  return invoke('references_zotero_sync_persist', {
    params: {
      globalConfigDir: projectRoot,
      apiKey,
      snapshot: options?.snapshot,
      selectedReferenceId: options?.selectedReferenceId,
    },
  })
}
