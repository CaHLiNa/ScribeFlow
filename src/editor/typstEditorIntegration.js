import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import { buildTypstDiagnosticSignature, hasTypstDiagnosticLocation } from './typstDiagnostics.js'

const setTypstDiagnosticsEffect = StateEffect.define()
const setActiveTypstDiagnosticEffect = StateEffect.define()

function diagnosticSignature(diagnostic) {
  return diagnostic?._signature || buildTypstDiagnosticSignature(diagnostic)
}

function buildDiagnosticDecorations(state, diagnostics = [], activeSignature = '') {
  const seenLines = new Map()

  for (const diagnostic of diagnostics) {
    if (!hasTypstDiagnosticLocation(diagnostic)) continue
    const lineNumber = Math.min(diagnostic.line, state.doc.lines)
    const signature = diagnosticSignature(diagnostic)
    const current = seenLines.get(lineNumber) || {
      severity: diagnostic.severity,
      active: false,
    }

    if (diagnostic.severity === 'error') {
      current.severity = 'error'
    }
    if (signature === activeSignature) {
      current.active = true
    }

    seenLines.set(lineNumber, current)
  }

  const decorations = []
  for (const [lineNumber, info] of seenLines.entries()) {
    const line = state.doc.line(lineNumber)
    const classNames = [
      'cm-typst-diagnostic-line',
      info.severity === 'warning' ? 'cm-typst-diagnostic-line-warning' : 'cm-typst-diagnostic-line-error',
    ]
    if (info.active) {
      classNames.push('cm-typst-diagnostic-line-active')
    }
    decorations.push(Decoration.line({ class: classNames.join(' ') }).range(line.from))
  }

  return Decoration.set(decorations, true)
}

const typstDiagnosticsField = StateField.define({
  create() {
    return {
      diagnostics: [],
      activeSignature: '',
      decorations: Decoration.none,
    }
  },

  update(value, tr) {
    let diagnostics = value.diagnostics
    let activeSignature = value.activeSignature
    let changed = false

    for (const effect of tr.effects) {
      if (effect.is(setTypstDiagnosticsEffect)) {
        diagnostics = effect.value
        changed = true
      }
      if (effect.is(setActiveTypstDiagnosticEffect)) {
        activeSignature = effect.value || ''
        changed = true
      }
    }

    if (!changed && !tr.docChanged) {
      return value
    }

    return {
      diagnostics,
      activeSignature,
      decorations: buildDiagnosticDecorations(tr.state, diagnostics, activeSignature),
    }
  },

  provide: field => EditorView.decorations.from(field, value => value.decorations),
})

export function createTypstDiagnosticsExtension() {
  return [typstDiagnosticsField]
}

export function updateTypstDiagnostics(view, diagnostics = [], options = {}) {
  if (!view) return
  const normalized = diagnostics.map(diagnostic => ({
    ...diagnostic,
    _signature: diagnosticSignature(diagnostic),
  }))
  const defaultActive = normalized[0]?._signature || ''
  view.dispatch({
    effects: [
      setTypstDiagnosticsEffect.of(normalized),
      setActiveTypstDiagnosticEffect.of(options.activeSignature || defaultActive),
    ],
  })
}

export function setActiveTypstDiagnostic(view, diagnostic) {
  if (!view) return
  view.dispatch({
    effects: setActiveTypstDiagnosticEffect.of(diagnosticSignature(diagnostic)),
  })
}

export function getTypstDiagnosticPosition(view, diagnostic) {
  if (!view || !hasTypstDiagnosticLocation(diagnostic)) return null
  const lineNumber = Math.min(diagnostic.line, view.state.doc.lines)
  return view.state.doc.line(lineNumber).from
}

export function focusTypstDiagnostic(view, diagnostic, options = {}) {
  const pos = getTypstDiagnosticPosition(view, diagnostic)
  if (pos == null) return false

  const effects = [setActiveTypstDiagnosticEffect.of(diagnosticSignature(diagnostic))]
  if (options.center !== false) {
    effects.push(EditorView.scrollIntoView(pos, { y: 'center' }))
  }

  view.dispatch({
    selection: { anchor: pos },
    scrollIntoView: true,
    effects,
  })
  view.focus()
  return true
}
