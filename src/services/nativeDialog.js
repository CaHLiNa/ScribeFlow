import { ask, open, save } from '@tauri-apps/plugin-dialog'
import { assertNativeDesktopRuntime } from './runtimeGuard.js'

export function openNativeDialog(options = {}) {
  assertNativeDesktopRuntime('Opening a native dialog')
  return open(options)
}

export function saveNativeDialog(options = {}) {
  assertNativeDesktopRuntime('Saving with a native dialog')
  return save(options)
}

export function askNativeDialog(message, options = {}) {
  assertNativeDesktopRuntime('Showing a native dialog')
  return ask(message, options)
}
