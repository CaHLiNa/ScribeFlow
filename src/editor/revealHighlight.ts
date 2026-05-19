import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'

const setRevealHighlightEffect = StateEffect.define()
const clearRevealHighlightEffect = StateEffect.define()

const revealHighlightTimers = new WeakMap()

function defaultSetTimeout(callback, delay) {
  return globalThis.setTimeout?.(callback, delay)
}

function defaultClearTimeout(handle) {
  globalThis.clearTimeout?.(handle)
}

function buildRevealHighlightDecorations(state, pos = null) {
  if (!Number.isInteger(pos)) return Decoration.none
  const safePos = Math.max(0, Math.min(pos, state.doc.length))
  const line = state.doc.lineAt(safePos)
  return Decoration.set([
    Decoration.line({ class: 'cm-reveal-target-line' }).range(line.from),
  ], true)
}

const revealHighlightField = StateField.define({
  create() {
    return {
      pos: null,
      decorations: Decoration.none,
    }
  },

  update(value, tr) {
    let pos = value.pos
    let changed = false

    if (pos != null && tr.docChanged) {
      pos = tr.changes.mapPos(pos)
      changed = true
    }

    for (const effect of tr.effects) {
      if (effect.is(setRevealHighlightEffect)) {
        pos = Number.isInteger(effect.value?.pos) ? effect.value.pos : null
        changed = true
      }
      if (effect.is(clearRevealHighlightEffect)) {
        pos = null
        changed = true
      }
    }

    if (!changed) {
      return value
    }

    return {
      pos,
      decorations: buildRevealHighlightDecorations(tr.state, pos),
    }
  },

  provide: field => EditorView.decorations.from(field, value => value.decorations),
})

export function createRevealHighlightExtension() {
  return [
    revealHighlightField,
    ViewPlugin.define((view) => ({
      destroy() {
        cancelRevealHighlight(view)
      },
    })),
  ]
}

function clearRevealHighlight(view) {
  if (!view) return
  try {
    view.dispatch({ effects: clearRevealHighlightEffect.of(null) })
  } catch {
    // Ignore stale view errors when a pane closes during the timeout window.
  }
}

function clearRevealHighlightTimer(view) {
  const pending = revealHighlightTimers.get(view)
  if (!pending) return false
  ;(pending.scheduler.clearTimeout || defaultClearTimeout)(pending.handle)
  revealHighlightTimers.delete(view)
  return true
}

export function cancelRevealHighlight(view, options = {}) {
  if (!view) return false
  const cancelled = clearRevealHighlightTimer(view)
  if (options.clearDecorations === true) {
    clearRevealHighlight(view)
  }
  return cancelled
}

export function focusEditorRangeWithHighlight(view, from, to = from, options = {}) {
  if (!view || !Number.isInteger(from)) return false

  const safeFrom = Math.max(0, Math.min(from, view.state.doc.length))
  const safeTo = Math.max(0, Math.min(Number.isInteger(to) ? to : safeFrom, view.state.doc.length))
  const line = view.state.doc.lineAt(safeFrom)
  const y = options.center === false ? 'nearest' : 'center'

  view.dispatch({
    selection: {
      anchor: safeFrom,
      head: safeTo,
    },
    effects: [
      EditorView.scrollIntoView(safeFrom, { y, yMargin: 80 }),
      setRevealHighlightEffect.of({ pos: line.from }),
    ],
  })

  if (options.focus !== false) {
    view.focus()
  }

  clearRevealHighlightTimer(view)

  const durationMs = Math.max(250, Number(options.durationMs || 1400))
  const scheduler = options.scheduler || {}
  const timerId = (scheduler.setTimeout || defaultSetTimeout)(() => {
    const pending = revealHighlightTimers.get(view)
    if (pending?.handle === timerId) {
      revealHighlightTimers.delete(view)
      clearRevealHighlight(view)
    }
  }, durationMs)

  if (timerId != null) {
    revealHighlightTimers.set(view, { handle: timerId, scheduler })
  }
  return true
}

export function focusEditorLineWithHighlight(view, lineNumber, options = {}) {
  if (!view || !Number.isInteger(lineNumber) || lineNumber <= 0) return false
  const safeLineNumber = Math.max(1, Math.min(lineNumber, view.state.doc.lines))
  const line = view.state.doc.line(safeLineNumber)
  return focusEditorRangeWithHighlight(view, line.from, line.from, options)
}
