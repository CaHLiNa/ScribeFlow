import {
  isCurrentWindowFullscreen,
  onCurrentWindowFocusChanged,
  onCurrentWindowResized,
  setCurrentWindowMinSize,
  startCurrentWindowDrag,
} from './tauriBridge.ts'

export function applyNativeWindowMinSize(width, height) {
  return setCurrentWindowMinSize(width, height)
}

export function isNativeWindowFullscreen() {
  return isCurrentWindowFullscreen()
}

export function startNativeWindowDrag() {
  return startCurrentWindowDrag()
}

export function onNativeWindowFocusChanged(handler) {
  return onCurrentWindowFocusChanged(handler)
}

export function onNativeWindowResized(handler) {
  return onCurrentWindowResized(handler)
}
