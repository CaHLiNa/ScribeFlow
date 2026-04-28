import { isTauriDesktopRuntime } from '../../platform'
import { applyNativeWindowMinSize } from '../../services/nativeWindow.js'

const MIN_APP_WINDOW_WIDTH = 1120
const MIN_APP_WINDOW_HEIGHT = 720

export async function applyAppWindowConstraints() {
  if (!isTauriDesktopRuntime) return

  try {
    await applyNativeWindowMinSize(MIN_APP_WINDOW_WIDTH, MIN_APP_WINDOW_HEIGHT)
  } catch (error) {
    console.warn('[window] failed to apply runtime min size constraints:', error)
  }
}
