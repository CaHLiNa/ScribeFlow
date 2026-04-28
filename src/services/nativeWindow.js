import { LogicalSize } from '@tauri-apps/api/dpi'
import { getCurrentWindow } from '@tauri-apps/api/window'

export function applyNativeWindowMinSize(width, height) {
  return getCurrentWindow().setMinSize(new LogicalSize(width, height))
}

export function isNativeWindowFullscreen() {
  return getCurrentWindow().isFullscreen()
}

export function startNativeWindowDrag() {
  return getCurrentWindow().startDragging()
}

export function onNativeWindowFocusChanged(handler) {
  return getCurrentWindow().onFocusChanged(handler)
}

export function onNativeWindowResized(handler) {
  return getCurrentWindow().onResized(handler)
}
