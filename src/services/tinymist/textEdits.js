function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function offsetToTinymistPosition(state, pos) {
  const line = state.doc.lineAt(pos)
  return {
    line: line.number - 1,
    character: pos - line.from,
  }
}

export function tinymistPositionToOffset(state, position = {}) {
  const lineNumber = clamp((Number(position.line) || 0) + 1, 1, Math.max(1, state.doc.lines))
  const line = state.doc.line(lineNumber)
  const character = clamp(Number(position.character) || 0, 0, line.length)
  return line.from + character
}

export function tinymistRangeToOffsets(state, range = {}) {
  if (!range?.start || !range?.end) return null
  return {
    from: tinymistPositionToOffset(state, range.start),
    to: tinymistPositionToOffset(state, range.end),
  }
}

export function applyTinymistTextEdits(view, edits = []) {
  const changes = edits
    .map((edit) => {
      const offsets = tinymistRangeToOffsets(view.state, edit?.range)
      if (!offsets) return null
      return {
        from: offsets.from,
        to: offsets.to,
        insert: String(edit?.newText || ''),
      }
    })
    .filter(Boolean)
    .sort((left, right) => (
      right.from - left.from || right.to - left.to
    ))

  if (changes.length === 0) return false

  view.dispatch({ changes })
  return true
}
