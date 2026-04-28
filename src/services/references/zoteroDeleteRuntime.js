import { invoke } from '@tauri-apps/api/core'
import { loadZoteroApiKey } from './zoteroAccount.js'
import { resolveZoteroGlobalConfigDir } from './zoteroShared.js'

export async function deleteFromZotero(reference = {}) {
  const globalConfigDir = await resolveZoteroGlobalConfigDir()
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
