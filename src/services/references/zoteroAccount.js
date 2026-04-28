import { invoke } from '@tauri-apps/api/core'
import { resolveZoteroGlobalConfigDir } from './zoteroShared.js'
import { resetZoteroSyncState } from './zoteroState.js'

export async function storeZoteroApiKey(apiKey = '') {
  const globalConfigDir = await resolveZoteroGlobalConfigDir()
  await invoke('references_zotero_api_key_store', {
    params: {
      globalConfigDir,
      apiKey,
    },
  })
}

export async function loadZoteroApiKey() {
  const globalConfigDir = await resolveZoteroGlobalConfigDir()
  const value = await invoke('references_zotero_api_key_load', {
    params: {
      globalConfigDir,
    },
  })
  return typeof value === 'string' && value.trim() ? value : null
}

export async function clearZoteroApiKey() {
  const globalConfigDir = await resolveZoteroGlobalConfigDir()
  await invoke('references_zotero_api_key_clear', {
    params: {
      globalConfigDir,
    },
  })
}

export async function disconnectZotero() {
  const globalConfigDir = await resolveZoteroGlobalConfigDir()
  await invoke('references_zotero_disconnect', {
    params: {
      globalConfigDir,
    },
  })
  resetZoteroSyncState()
}
