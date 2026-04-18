import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export const NATIVE_EDITOR_EVENT = 'native-editor-event'

function requireTauriInvoke() {
  if (typeof window === 'undefined' || typeof window.__TAURI_INTERNALS__?.invoke !== 'function') {
    throw new Error('Tauri invoke is required for native editor runtime commands.')
  }
}

export function nativeEditorBridgeAvailable() {
  return typeof window !== 'undefined' && typeof window.__TAURI_INTERNALS__?.invoke === 'function'
}

export async function startNativeEditorSession() {
  requireTauriInvoke()
  return invoke('native_editor_session_start')
}

export async function openNativeEditorDocument({ path = '', text = '' } = {}) {
  requireTauriInvoke()
  return invoke('native_editor_session_open_document', {
    request: {
      path: String(path || ''),
      text: String(text || ''),
    },
  })
}

export async function replaceNativeEditorDocumentText({ path = '', text = '' } = {}) {
  requireTauriInvoke()
  return invoke('native_editor_session_replace_document_text', {
    request: {
      path: String(path || ''),
      text: String(text || ''),
    },
  })
}

export async function applyNativeEditorExternalContent({ path = '', text = '' } = {}) {
  requireTauriInvoke()
  return invoke('native_editor_session_apply_external_content', {
    request: {
      path: String(path || ''),
      text: String(text || ''),
    },
  })
}

export async function stopNativeEditorSession() {
  requireTauriInvoke()
  return invoke('native_editor_session_stop')
}

export async function listenToNativeEditorEvents(onEvent = () => {}) {
  requireTauriInvoke()
  return listen(NATIVE_EDITOR_EVENT, (event) => {
    onEvent(event?.payload || {})
  })
}
