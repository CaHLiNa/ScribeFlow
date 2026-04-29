import { invoke } from '@tauri-apps/api/core'

export function loadWorkbenchLayout() {
  return invoke('workbench_layout_load', {
    params: {},
  })
}

export function saveWorkbenchLayout(state = {}) {
  return invoke('workbench_layout_save', {
    params: {
      state,
    },
  })
}
