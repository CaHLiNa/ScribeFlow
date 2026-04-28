import {
  readText as readClipboardText,
  writeText as writeClipboardText,
} from '@tauri-apps/plugin-clipboard-manager'

export function readNativeClipboardText() {
  return readClipboardText()
}

export function writeNativeClipboardText(text = '') {
  return writeClipboardText(String(text || ''))
}
