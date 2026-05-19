import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { emit, listen, type Event, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  readText as readClipboardText,
  writeText as writeClipboardText,
} from '@tauri-apps/plugin-clipboard-manager'
import { ask, open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog'
import { open as openShell } from '@tauri-apps/plugin-shell'

export type TauriCommandArgs = Record<string, unknown>

export function getRuntimeVersion(): Promise<string> {
  return getVersion()
}

export function invokeCommand<TResult = unknown>(
  command: string,
  args?: TauriCommandArgs,
): Promise<TResult> {
  return invoke<TResult>(command, args)
}

export function listenEvent<TPayload = unknown>(
  eventName: string,
  handler: (event: Event<TPayload>) => void,
): Promise<UnlistenFn> {
  return listen<TPayload>(eventName, handler)
}

export function listenToNativeEvent<TPayload = unknown>(
  eventName: string,
  handler: (payload: TPayload, event: Event<TPayload>) => void,
): Promise<UnlistenFn> {
  return listen<TPayload>(eventName, (event) => {
    handler(event.payload, event)
  })
}

export function emitEvent<TPayload = unknown>(
  eventName: string,
  payload?: TPayload,
): Promise<void> {
  return emit(eventName, payload)
}

export function readNativeClipboardTextRaw(): Promise<string> {
  return readClipboardText()
}

export function writeNativeClipboardTextRaw(text: string): Promise<void> {
  return writeClipboardText(text)
}

export function openNativeDialogRaw(options?: Parameters<typeof openDialog>[0]) {
  return openDialog(options)
}

export function saveNativeDialogRaw(options?: Parameters<typeof saveDialog>[0]) {
  return saveDialog(options)
}

export function askNativeDialogRaw(
  message: Parameters<typeof ask>[0],
  options?: Parameters<typeof ask>[1],
) {
  return ask(message, options)
}

export function openShellUrl(url: string): Promise<void> {
  return openShell(url)
}

export function setCurrentWindowMinSize(width: number, height: number) {
  return getCurrentWindow().setMinSize(new LogicalSize(width, height))
}

export function isCurrentWindowFullscreen(): Promise<boolean> {
  return getCurrentWindow().isFullscreen()
}

export function startCurrentWindowDrag(): Promise<void> {
  return getCurrentWindow().startDragging()
}

export function onCurrentWindowFocusChanged(
  handler: Parameters<ReturnType<typeof getCurrentWindow>['onFocusChanged']>[0],
) {
  return getCurrentWindow().onFocusChanged(handler)
}

export function onCurrentWindowResized(
  handler: Parameters<ReturnType<typeof getCurrentWindow>['onResized']>[0],
) {
  return getCurrentWindow().onResized(handler)
}
