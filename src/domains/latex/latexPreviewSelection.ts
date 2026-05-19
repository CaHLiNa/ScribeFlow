function indexes(source = '', find = '') {
  const next = []
  if (!find) return next
  for (let index = 0; index < source.length; index += 1) {
    if (source.slice(index, index + find.length) === find) {
      next.push(index)
    }
  }
  return next
}

function scoreColumnMatches(lineText = '', textBeforeSelectionFull = '', textAfterSelectionFull = '') {
  let previousColumnMatches = null

  const maxLength = Math.max(textBeforeSelectionFull.length, textAfterSelectionFull.length)
  for (let length = 5; length <= maxLength; length += 1) {
    const columns = []
    const textBeforeSelection = textBeforeSelectionFull.slice(textBeforeSelectionFull.length - length)
    const textAfterSelection = textAfterSelectionFull.slice(0, length)

    if (textBeforeSelection) {
      const beforeColumns = indexes(lineText, textBeforeSelection).map(index => index + textBeforeSelection.length)
      columns.push(...beforeColumns)
    }
    if (textAfterSelection) {
      const afterColumns = indexes(lineText, textAfterSelection)
      columns.push(...afterColumns)
    }

    const columnMatches = Object.create(null)
    for (const column of columns) {
      columnMatches[column] = (columnMatches[column] || 0) + 1
    }
    const values = Object.values(columnMatches).sort((left, right) => left - right)

    if (values.length > 1 && values[0] === values[1]) {
      previousColumnMatches = columnMatches
      continue
    }
    if (values.length >= 1) {
      return {
        column: Number(Object.keys(columnMatches).reduce((best, current) =>
          columnMatches[best] > columnMatches[current] ? best : current
        )),
      }
    }
    if (previousColumnMatches && Object.keys(previousColumnMatches).length > 0) {
      return {
        column: Number(Object.keys(previousColumnMatches).reduce((best, current) =>
          previousColumnMatches[best] > previousColumnMatches[current] ? best : current
        )),
      }
    }
    return null
  }

  return null
}

export function resolveLatexEditorSelectionFromContext(view, location = {}) {
  const line = Number(location?.line || 0)
  if (!view || !Number.isInteger(line) || line < 1) return null

  const textBeforeSelection = String(location?.textBeforeSelection || '')
  const textAfterSelection = String(location?.textAfterSelection || '')
  const explicitColumn = Number(location?.column)
  const strictLine = location?.strictLine === true

  const safeLine = Math.max(1, Math.min(line, view.state.doc.lines))
  const lineInfo = view.state.doc.line(safeLine)
  if (textBeforeSelection.length >= 5 || textAfterSelection.length >= 5) {
    const candidateRows = strictLine
      ? [safeLine]
      : [safeLine, safeLine - 1, safeLine + 1]
    const normalizedCandidateRows = candidateRows
      .filter((row, index, rows) => row >= 1 && row <= view.state.doc.lines && rows.indexOf(row) === index)

    for (const row of normalizedCandidateRows) {
      const candidateLine = view.state.doc.line(row)
      const match = scoreColumnMatches(candidateLine.text, textBeforeSelection, textAfterSelection)
      if (!match) continue
      const safeColumn = Math.max(0, Math.min(match.column, candidateLine.text.length))
      return {
        lineNumber: row,
        from: candidateLine.from + safeColumn,
        to: candidateLine.from + safeColumn,
      }
    }
  }

  if (
    Number.isInteger(explicitColumn)
    && explicitColumn > 0
    && explicitColumn <= lineInfo.text.length
  ) {
    return { lineNumber: safeLine, from: lineInfo.from + explicitColumn, to: lineInfo.from + explicitColumn }
  }

  return { lineNumber: safeLine, from: lineInfo.from, to: lineInfo.from }
}
