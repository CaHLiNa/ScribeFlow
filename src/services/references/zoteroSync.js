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

export async function loadZoteroAccountState() {
  const globalConfigDir = await getGlobalConfigDir()
  const state = await invoke('references_zotero_account_state_load', {
    params: {
      globalConfigDir,
    },
  })
  if (!state || typeof state !== 'object') {
    return {
      config: {},
      hasApiKey: false,
    }
  }
  return {
    config: state.config && typeof state.config === 'object' ? state.config : {},
    hasApiKey: Boolean(state.hasApiKey),
  }
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

export async function loadRemoteLibraries(userId = '') {
  return invoke('references_zotero_remote_libraries_with_account', {
    params: {
      userId,
    },
  })
}

export async function deleteFromZotero(reference = {}) {
  await invoke('references_zotero_delete_item_with_account', {
    params: {
      reference,
    },
  })
}

export async function syncNow(projectRoot = '', options = {}) {
  return invoke('references_zotero_sync_persist_with_account', {
    params: {
      globalConfigDir: projectRoot,
      snapshot: options?.snapshot,
      selectedReferenceId: options?.selectedReferenceId,
    },
  })
}
