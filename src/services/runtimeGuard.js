import { isTauriDesktopRuntime } from '../platform'

export function isNativeDesktopRuntime() {
  return isTauriDesktopRuntime
}

export function assertNativeDesktopRuntime(featureLabel = 'This action') {
  if (isNativeDesktopRuntime()) return
  throw new Error(`${featureLabel} requires the Tauri desktop runtime. Start the app with "npm run tauri dev".`)
}
