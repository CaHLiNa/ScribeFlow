import { invokeCommand as invoke } from './tauriBridge.ts'
import { isNativeDesktopRuntime } from './runtimeGuard.ts'

export function getHomeDir() {
  if (!isNativeDesktopRuntime()) return Promise.resolve('')
  return invoke('get_home_dir')
}

export function getGlobalConfigDir() {
  if (!isNativeDesktopRuntime()) return Promise.resolve('')
  return invoke('get_global_config_dir')
}
