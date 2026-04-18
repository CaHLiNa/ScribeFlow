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

export async function applyNativeEditorTransaction({ path = '', edits = [] } = {}) {
  requireTauriInvoke()
  return invoke('native_editor_session_apply_transaction', {
    request: {
      path: String(path || ''),
      edits: Array.isArray(edits)
        ? edits.map((edit) => ({
            start: Number(edit?.start || 0),
            end: Number(edit?.end || 0),
            text: String(edit?.text || ''),
          }))
        : [],
    },
  })
}

export async function setNativeEditorSelections({ path = '', selections = [], viewportOffset = null } = {}) {
  requireTauriInvoke()
  return invoke('native_editor_session_set_selections', {
    request: {
      path: String(path || ''),
      selections: Array.isArray(selections)
        ? selections.map((selection) => ({
            anchor: Number(selection?.anchor || 0),
            head: Number(selection?.head || 0),
          }))
        : [],
      viewportOffset:
        viewportOffset === null || viewportOffset === undefined ? null : Number(viewportOffset || 0),
    },
  })
}

export async function setNativeEditorDiagnostics({ path = '', diagnostics = [] } = {}) {
  requireTauriInvoke()
  return invoke('native_editor_session_set_diagnostics', {
    request: {
      path: String(path || ''),
      diagnostics: Array.isArray(diagnostics) ? diagnostics : [],
    },
  })
}

export async function setNativeEditorOutlineContext({ path = '', context = null } = {}) {
  requireTauriInvoke()
  return invoke('native_editor_session_set_outline_context', {
    request: {
      path: String(path || ''),
      context: context == null ? null : context,
    },
  })
}

export async function recordNativeEditorWorkflowEvent({ path = '', event = null } = {}) {
  requireTauriInvoke()
  return invoke('native_editor_session_record_workflow_event', {
    request: {
      path: String(path || ''),
      event: event == null ? null : event,
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

export async function getNativeEditorDocumentState({ path = '' } = {}) {
  requireTauriInvoke()
  return invoke('native_editor_document_state', {
    request: {
      path: String(path || ''),
    },
  })
}

export async function inspectNativeEditorInteractionContext({
  path = '',
  text = null,
  selection = null,
} = {}) {
  requireTauriInvoke()
  return invoke('native_editor_inspect_interaction_context', {
    request: {
      path: String(path || ''),
      text: typeof text === 'string' ? text : null,
      selection:
        selection && typeof selection === 'object'
          ? {
              anchor: Number(selection?.anchor || 0),
              head: Number(selection?.head || 0),
            }
          : null,
    },
  })
}

export async function planNativeEditorCitationReplacement({
  path = '',
  operation = '',
  trigger = null,
  edit = null,
  keys = [],
  cites = [],
  latexCommand = null,
} = {}) {
  requireTauriInvoke()
  return invoke('native_editor_plan_citation_replacement', {
    request: {
      path: String(path || ''),
      operation: String(operation || ''),
      trigger: trigger == null ? null : trigger,
      edit: edit == null ? null : edit,
      keys: Array.isArray(keys) ? keys.map((key) => String(key || '')) : [],
      cites: Array.isArray(cites)
        ? cites.map((cite) => ({
            key: String(cite?.key || ''),
            locator: String(cite?.locator || ''),
            prefix: String(cite?.prefix || ''),
          }))
        : [],
      latexCommand: latexCommand == null ? null : String(latexCommand || ''),
    },
  })
}

export async function planNativeEditorFileDropInsertion({
  sourcePath = '',
  droppedPaths = [],
} = {}) {
  requireTauriInvoke()
  return invoke('native_editor_plan_file_drop_insertion', {
    request: {
      sourcePath: String(sourcePath || ''),
      droppedPaths: Array.isArray(droppedPaths) ? droppedPaths.map((path) => String(path || '')) : [],
    },
  })
}

export async function getNativeEditorSessionState() {
  requireTauriInvoke()
  return invoke('native_editor_session_state')
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
