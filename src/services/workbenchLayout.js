import { invoke } from '@tauri-apps/api/core'
import { isNativeDesktopRuntime } from './runtimeGuard.js'

export function loadWorkbenchLayout() {
  if (!isNativeDesktopRuntime()) return Promise.resolve({})
  return invoke('workbench_layout_load', {
    params: {},
  })
}

export function saveWorkbenchLayout(state = {}) {
  if (!isNativeDesktopRuntime()) return Promise.resolve(state)
  return invoke('workbench_layout_save', {
    params: {
      state,
    },
  })
}
