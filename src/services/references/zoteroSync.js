import { invoke } from '@tauri-apps/api/core'
import { getGlobalConfigDir } from '../appDirs.js'

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

export async function connectZoteroAccount(apiKey = '') {
  const globalConfigDir = await getGlobalConfigDir()
  const config = await invoke('references_zotero_connect_account', {
    params: {
      globalConfigDir,
      apiKey,
    },
  })
  return config && typeof config === 'object' ? config : {}
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
