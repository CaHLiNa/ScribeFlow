// Platform detection — single source of truth for OS-specific behavior

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
export const isWindows = /Win/.test(navigator.platform)
export const isLinux = !isMac && !isWindows
export const isTauriDesktopRuntime =
  typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__

// Check the platform's primary modifier key (Cmd on macOS, Ctrl on Windows/Linux)
export function isMod(e) {
  return isMac ? e.metaKey : e.ctrlKey
}

// Display strings
export const modKey = isMac ? 'Cmd' : 'Ctrl'
export const altKey = isMac ? 'Option' : 'Alt'

// Default shell per platform
export function defaultShell() {
  if (isMac) return { cmd: '/bin/zsh', args: ['-l'] }
  if (isWindows) return { cmd: 'cmd.exe', args: [] }
  return { cmd: '/bin/bash', args: ['-l'] }
}
