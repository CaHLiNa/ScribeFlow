import { invoke } from '@tauri-apps/api/core'
import {
  clearLegacyWorkbenchLayoutState,
  readLegacyWorkbenchLayoutState,
} from './workbenchLayoutState.js'

export async function loadWorkbenchLayoutState() {
  const legacyState = readLegacyWorkbenchLayoutState()
  const state = await invoke('workbench_layout_load', {
    params: {
      legacyState,
    },
  })
  clearLegacyWorkbenchLayoutState()
  return {
    ...legacyState,
    ...(state || {}),
  }
}

export async function saveWorkbenchLayoutState(state) {
  const payload = state && typeof state === 'object' ? state : {}
  const saved = await invoke('workbench_layout_save', {
    params: {
      state: payload,
    },
  })
  clearLegacyWorkbenchLayoutState()
  return saved || payload
}
