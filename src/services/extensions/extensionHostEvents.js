import { listenEvent as listen } from '../tauriBridge.ts'

export function listenExtensionViewChanged(handler) {
  return listen('extension-view-changed', handler)
}

export function listenExtensionViewStateChanged(handler) {
  return listen('extension-view-state-changed', handler)
}

export function listenExtensionViewRevealRequested(handler) {
  return listen('extension-view-reveal-requested', handler)
}

export function listenExtensionWindowInputRequested(handler) {
  return listen('extension-window-input-requested', handler)
}

export function listenExtensionWindowMessage(handler) {
  return listen('extension-window-message', handler)
}

export function listenExtensionHostCallRequested(handler) {
  return listen('extension-host-call-requested', handler)
}

export function listenExtensionHostInterrupted(handler) {
  return listen('extension-host-interrupted', handler)
}

export function listenExtensionTaskChanged(handler) {
  return listen('extension-task-changed', handler)
}
