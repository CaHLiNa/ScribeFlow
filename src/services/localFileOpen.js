import { invoke } from '@tauri-apps/api/core'
import { useToastStore } from '../stores/toast'
import { t } from '../i18n'

export async function openLocalPath(path) {
  if (!path) return false

  try {
    await invoke('workspace_open_path_in_default_app', { path })
    return true
  } catch (error) {
    const displayPath = typeof path === 'string' ? path : ''
    useToastStore().showOnce(
      `open-local:${displayPath || 'unknown'}`,
      t('Failed to open file: {error}', {
        error: error?.message || String(error || ''),
      }),
      {
        type: 'error',
        duration: 5000,
      },
      2000
    )
    return false
  }
}
