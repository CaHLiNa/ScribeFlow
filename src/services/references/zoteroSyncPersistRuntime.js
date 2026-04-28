import { invoke } from '@tauri-apps/api/core'
import { loadZoteroApiKey } from './zoteroAccount.js'
import { loadZoteroConfig } from './zoteroConfig.js'
import { classifyZoteroSyncError, setZoteroSyncState } from './zoteroState.js'
import { resolveZoteroGlobalConfigDir } from './zoteroShared.js'

export async function syncNow(projectRoot = '', referencesStore) {
  const [config, apiKey, resolvedDir] = await Promise.all([
    loadZoteroConfig(projectRoot),
    loadZoteroApiKey(),
    resolveZoteroGlobalConfigDir(projectRoot),
  ])
  if (!config || !apiKey) {
    setZoteroSyncState({ status: 'disconnected', error: null, errorType: null, progress: null })
    return { imported: 0, linked: 0, updated: 0 }
  }

  setZoteroSyncState({ status: 'syncing', error: null, errorType: null, progress: null })

  try {
    const result = await invoke('references_zotero_sync_persist', {
      params: {
        globalConfigDir: resolvedDir,
        apiKey,
        snapshot: referencesStore.buildLibrarySnapshotPayload(),
        selectedReferenceId: referencesStore.selectedReferenceId,
      },
    })

    await referencesStore.applyLibrarySnapshot(result?.snapshot || {})
    if (result?.selectedReferenceId) {
      referencesStore.selectedReferenceId = result.selectedReferenceId
    }

    setZoteroSyncState({
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
    setZoteroSyncState({
      status: 'error',
      error: error?.message || String(error),
      errorType: classifyZoteroSyncError(error),
      progress: null,
    })
    throw error
  }
}
