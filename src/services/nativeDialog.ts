import { assertNativeDesktopRuntime } from './runtimeGuard.ts'
import {
  askNativeDialogRaw,
  openNativeDialogRaw,
  saveNativeDialogRaw,
} from './tauriBridge.ts'

export function openNativeDialog(options = {}) {
  assertNativeDesktopRuntime('Opening a native dialog')
  return openNativeDialogRaw(options)
}

export function saveNativeDialog(options = {}) {
  assertNativeDesktopRuntime('Saving with a native dialog')
  return saveNativeDialogRaw(options)
}

export function askNativeDialog(message, options = {}) {
  assertNativeDesktopRuntime('Showing a native dialog')
  return askNativeDialogRaw(message, options)
}
