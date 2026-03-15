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

export function useTypstDiagnostics(options) {
  const { filePath, getView, typstStore, editorStore } = options

  const typstUi = reactive({
    diagnostics: [],
    activeSignature: '',
    expanded: false,
    lastCompileStatus: null,
    lastAutoJumpSignature: '',
    jumpInFlight: false,
    userMovedSinceLastJump: false,
  })

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

  function applyTypstDiagnosticsState(result, options = {}) {
    const diagnostics = normalizeTypstDiagnostics(filePath, result).map((diagnostic) => ({
      ...diagnostic,
      _signature: buildTypstDiagnosticSignature(diagnostic),
    }))

    const nextStatus = options.status ?? (result?.success ? 'success' : diagnostics.length ? 'error' : null)
    const statusTransition = getTypstStatusTransition(typstUi.lastCompileStatus, nextStatus)
    typstUi.lastCompileStatus = nextStatus

    if (diagnostics.length === 0) {
      clearTypstDiagnosticsUi()
      return
    }

    const primary = getPrimaryTypstDiagnostic(diagnostics)
    const preservedActive = diagnostics.find((diagnostic) => diagnostic._signature === typstUi.activeSignature) || null
    const defaultDiagnostic = preservedActive || primary || diagnostics[0] || null
    const nextSignature = defaultDiagnostic?._signature || ''
    const shouldJump = options.allowAutoJump !== false
      && shouldAutoJumpTypstDiagnostic(typstUi.lastAutoJumpSignature, primary, {
        statusTransition,
        userMovedSinceLastJump: typstUi.userMovedSinceLastJump,
        nextSignature: primary?._signature || '',
      })

    typstUi.diagnostics = diagnostics
    typstUi.activeSignature = nextSignature
    typstUi.expanded = typstUi.expanded && diagnostics.length > 1

    const view = getView()
    if (view) {
      updateTypstDiagnostics(view, diagnostics, { activeSignature: nextSignature })
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
    focusEditorLine,
    handleEditorSelectionChange,
    hydrateTypstDiagnostics,
    registerWindowListeners,
  }
}
