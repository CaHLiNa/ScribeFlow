import { reactive } from 'vue'
import { EditorView } from '@codemirror/view'
import {
  normalizeTypstDiagnostics,
  buildTypstDiagnosticSignature,
  getPrimaryTypstDiagnostic,
  getTypstStatusTransition,
  shouldAutoJumpTypstDiagnostic,
} from '../editor/typstDiagnostics'
import {
  updateTypstDiagnostics,
  focusTypstDiagnostic,
} from '../editor/typstEditorIntegration'
import {
  closeTinymistDocument,
  ensureTinymistDocument,
  subscribeTinymistDiagnostics,
  subscribeTinymistStatus,
  updateTinymistDocument,
} from '../services/tinymist/session'
import {
  getTinymistDiagnosticsStatus,
  normalizeTinymistDiagnostics,
} from '../services/tinymist/diagnostics'

const TINYMIST_SYNC_DEBOUNCE_MS = 180

export function useTypstDiagnostics(options) {
  const { filePath, getView, typstStore, editorStore, getWorkspacePath } = options

  const typstUi = reactive({
    diagnostics: [],
    activeSignature: '',
    expanded: false,
    lastCompileStatus: null,
    lastAutoJumpSignature: '',
    jumpInFlight: false,
    userMovedSinceLastJump: false,
    diagnosticsProvider: 'compile',
    tinymistActive: false,
  })

  let tinymistSyncTimer = null
  let cleanupTinymistDiagnostics = null
  let cleanupTinymistStatus = null
  let tinymistDocumentOpen = false

  function clearTypstDiagnosticsUi() {
    typstUi.diagnostics = []
    typstUi.activeSignature = ''
    typstUi.expanded = false
    typstUi.userMovedSinceLastJump = false
    const view = getView()
    if (view) {
      updateTypstDiagnostics(view, [], { activeSignature: '' })
    }
  }

  function applyNormalizedDiagnostics(diagnostics, options = {}) {
    const normalized = diagnostics.map((diagnostic) => ({
      ...diagnostic,
      _signature: buildTypstDiagnosticSignature(diagnostic),
    }))

    const nextStatus = options.status ?? (
      normalized.some(diagnostic => diagnostic.severity === 'error')
        ? 'error'
        : 'success'
    )
    const statusTransition = getTypstStatusTransition(typstUi.lastCompileStatus, nextStatus)
    typstUi.lastCompileStatus = nextStatus

    if (normalized.length === 0) {
      clearTypstDiagnosticsUi()
      return
    }

    const primary = getPrimaryTypstDiagnostic(normalized)
    const preservedActive = normalized.find((diagnostic) => diagnostic._signature === typstUi.activeSignature) || null
    const defaultDiagnostic = preservedActive || primary || normalized[0] || null
    const nextSignature = defaultDiagnostic?._signature || ''
    const shouldJump = options.allowAutoJump !== false
      && shouldAutoJumpTypstDiagnostic(typstUi.lastAutoJumpSignature, primary, {
        statusTransition,
        userMovedSinceLastJump: typstUi.userMovedSinceLastJump,
        nextSignature: primary?._signature || '',
      })

    typstUi.diagnostics = normalized
    typstUi.activeSignature = nextSignature
    typstUi.expanded = typstUi.expanded && normalized.length > 1

    const view = getView()
    if (view) {
      updateTypstDiagnostics(view, normalized, { activeSignature: nextSignature })
    }

    if (shouldJump && view && primary) {
      typstUi.activeSignature = primary._signature
      typstUi.jumpInFlight = true
      focusTypstDiagnostic(view, primary, { center: true })
      typstUi.jumpInFlight = false
      typstUi.lastAutoJumpSignature = primary._signature
      typstUi.userMovedSinceLastJump = false
    }
  }

  function applyTypstDiagnosticsState(result, options = {}) {
    typstUi.diagnosticsProvider = 'compile'
    applyNormalizedDiagnostics(normalizeTypstDiagnostics(filePath, result), {
      ...options,
      status: options.status ?? (result?.success ? 'success' : 'error'),
    })
  }

  function applyTinymistDiagnosticsState(rawDiagnostics = [], options = {}) {
    const normalized = normalizeTinymistDiagnostics(filePath, rawDiagnostics)
    typstUi.diagnosticsProvider = 'tinymist'
    applyNormalizedDiagnostics(normalized, {
      ...options,
      status: options.status ?? getTinymistDiagnosticsStatus(normalized),
    })
  }

  function focusSelectedTypstDiagnostic(diagnostic) {
    const view = getView()
    const signature = diagnostic?._signature || buildTypstDiagnosticSignature(diagnostic)
    typstUi.activeSignature = signature
    if (!view) return

    updateTypstDiagnostics(view, typstUi.diagnostics, { activeSignature: signature })
    typstUi.jumpInFlight = true
    focusTypstDiagnostic(view, diagnostic, { center: true })
    typstUi.jumpInFlight = false
  }

  function focusEditorLine(lineNumber, options = {}) {
    const view = getView()
    if (!view || !lineNumber) return

    const safeLine = Math.max(1, Math.min(lineNumber, view.state.doc.lines))
    const line = view.state.doc.line(safeLine)
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: options.center ? 'center' : 'nearest', yMargin: 80 }),
    })
    view.focus()
  }

  function handleEditorSelectionChange(head) {
    editorStore.cursorOffset = head
    typstUi.userMovedSinceLastJump = true
  }

  function hydrateTypstDiagnostics() {
    if (typstUi.tinymistActive) return
    const existingState = typstStore.stateForFile(filePath)
    if (!existingState) return

    applyTypstDiagnosticsState(existingState, {
      status: existingState.status,
      allowAutoJump: false,
    })
  }

  function handleTypstCompileDone(event) {
    const { typPath } = event.detail || {}
    if (typPath !== filePath) return
    if (typstUi.tinymistActive) return

    applyTypstDiagnosticsState(event.detail || {}, {
      status: event.detail?.success ? 'success' : 'error',
      allowAutoJump: editorStore.activeTab === filePath,
    })
  }

  function handleWorkflowFocusProblem(event) {
    const problem = event.detail || {}
    if (problem.sourcePath !== filePath) return

    const view = getView()
    if (!view) return

    const matchingDiagnostic = typstUi.diagnostics.find((diagnostic) => (
      diagnostic.line === (problem.line ?? null)
      && diagnostic.message === (problem.message || '')
    ))
    if (matchingDiagnostic) {
      focusSelectedTypstDiagnostic(matchingDiagnostic)
      return
    }

    if (problem.line) {
      focusEditorLine(problem.line, { center: true })
    }
  }

  async function connectTinymistDocument(text) {
    if (cleanupTinymistStatus == null) {
      cleanupTinymistStatus = subscribeTinymistStatus((status) => {
        typstUi.tinymistActive = status.available === true
        if (!status.available && typstUi.diagnosticsProvider === 'tinymist') {
          hydrateTypstDiagnostics()
        }
      })
    }

    const connected = await ensureTinymistDocument(filePath, text, {
      workspacePath: getWorkspacePath?.() || null,
    })
    if (!connected) return false

    tinymistDocumentOpen = true
    typstUi.tinymistActive = true
    applyTinymistDiagnosticsState([], {
      allowAutoJump: false,
      status: 'success',
    })

    if (cleanupTinymistDiagnostics == null) {
      cleanupTinymistDiagnostics = subscribeTinymistDiagnostics(filePath, (diagnostics) => {
        applyTinymistDiagnosticsState(diagnostics, {
          allowAutoJump: editorStore.activeTab === filePath,
        })
      })
    }

    return true
  }

  function scheduleTinymistSync(text) {
    if (!typstUi.tinymistActive || !tinymistDocumentOpen) return
    clearTimeout(tinymistSyncTimer)
    tinymistSyncTimer = setTimeout(() => {
      void updateTinymistDocument(filePath, text).catch(() => {})
    }, TINYMIST_SYNC_DEBOUNCE_MS)
  }

  async function disconnectTinymistDocument() {
    clearTimeout(tinymistSyncTimer)
    tinymistSyncTimer = null

    if (cleanupTinymistDiagnostics) {
      cleanupTinymistDiagnostics()
      cleanupTinymistDiagnostics = null
    }
    if (cleanupTinymistStatus) {
      cleanupTinymistStatus()
      cleanupTinymistStatus = null
    }
    if (tinymistDocumentOpen) {
      await closeTinymistDocument(filePath)
      tinymistDocumentOpen = false
    }
    typstUi.tinymistActive = false
  }

  function registerWindowListeners(isTypstFile) {
    if (isTypstFile) {
      window.addEventListener('typst-compile-done', handleTypstCompileDone)
    }
    window.addEventListener('document-workflow-focus-problem', handleWorkflowFocusProblem)

    return () => {
      if (isTypstFile) {
        window.removeEventListener('typst-compile-done', handleTypstCompileDone)
      }
      window.removeEventListener('document-workflow-focus-problem', handleWorkflowFocusProblem)
    }
  }

  return {
    typstUi,
    applyTypstDiagnosticsState,
    clearTypstDiagnosticsUi,
    connectTinymistDocument,
    disconnectTinymistDocument,
    focusEditorLine,
    handleEditorSelectionChange,
    hydrateTypstDiagnostics,
    registerWindowListeners,
    scheduleTinymistSync,
  }
}
