import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export function pathExists(path) {
  return invoke('path_exists', { path })
}

export async function revealPathInFileManager(entry) {
  return invoke('reveal_in_file_manager', { path: entry.path })
}

export async function listenNativeFileDropEvents(handlers) {
  const stopOver = await listen('tauri://drag-over', (event) => {
    handlers.onOver?.(event.payload)
  })
  const stopDrop = await listen('tauri://drag-drop', (event) => {
    handlers.onDrop?.(event.payload)
  })
  const stopLeave = await listen('tauri://drag-leave', (event) => {
    handlers.onLeave?.(event.payload)
  })

  return () => {
    stopOver?.()
    stopDrop?.()
    stopLeave?.()
  }
}
