import {
  readNativeClipboardTextRaw,
  writeNativeClipboardTextRaw,
} from './tauriBridge.ts'

export function readNativeClipboardText() {
  return readNativeClipboardTextRaw()
}

export function writeNativeClipboardText(text = '') {
  return writeNativeClipboardTextRaw(String(text || ''))
}
