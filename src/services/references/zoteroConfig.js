import { invoke } from '@tauri-apps/api/core'
import { resolveZoteroGlobalConfigDir } from './zoteroShared.js'

export async function loadZoteroConfig(globalConfigDir = '') {
  const resolvedDir = await resolveZoteroGlobalConfigDir(globalConfigDir)
  const config = await invoke('references_zotero_config_load', {
    params: {
      globalConfigDir: resolvedDir,
    },
  })
  return config && typeof config === 'object' ? config : null
}

export async function saveZoteroConfig(config = null, globalConfigDir = '') {
  const resolvedDir = await resolveZoteroGlobalConfigDir(globalConfigDir)
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
