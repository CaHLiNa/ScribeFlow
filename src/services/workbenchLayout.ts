import { invokeCommand as invoke } from './tauriBridge.ts'
import { isNativeDesktopRuntime } from './runtimeGuard.ts'

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
