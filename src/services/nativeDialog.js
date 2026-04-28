import { ask, open, save } from '@tauri-apps/plugin-dialog'

export function openNativeDialog(options = {}) {
  return open(options)
}

export function saveNativeDialog(options = {}) {
  return save(options)
}

export function askNativeDialog(message, options = {}) {
  return ask(message, options)
}
