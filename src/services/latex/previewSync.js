import { focusEditorLineWithHighlight, focusEditorRangeWithHighlight } from '../../editor/revealHighlight.js'
import {
  dirnamePath,
  normalizeFsPath,
  resolveRelativePath,
} from '../documentIntelligence/workspaceGraph.js'

const VIEW_WAIT_TIMEOUT_MS = 1500

function collapseFsPathSegments(value = '') {
  const normalized = normalizeFsPath(value)
  if (!normalized) return ''

  const isAbsolute = normalized.startsWith('/')
  const drivePrefixMatch = normalized.match(/^[A-Za-z]:\//)
  const drivePrefix = drivePrefixMatch ? drivePrefixMatch[0].slice(0, 2) : ''
  const seed = drivePrefix ? normalized.slice(3) : isAbsolute ? normalized.slice(1) : normalized
  const nextSegments = []

  for (const segment of seed.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (nextSegments.length > 0) nextSegments.pop()
      continue
    }
    nextSegments.push(segment)
  }

  if (drivePrefix) {
    return normalizeFsPath(`${drivePrefix}/${nextSegments.join('/')}`)
  }
  if (isAbsolute) {
    return normalizeFsPath(`/${nextSegments.join('/')}`)
  }
  return normalizeFsPath(nextSegments.join('/'))
}

export function resolveLatexSyncTargetPath(reportedFile = '', options = {}) {
  const normalizedReported = collapseFsPathSegments(reportedFile)
  const normalizedCompileTargetPath = normalizeFsPath(options.compileTargetPath || '')
  const normalizedSourcePath = normalizeFsPath(options.sourcePath || '')
  if (!normalizedReported) return ''
  if (normalizedReported.startsWith('/') || /^[A-Za-z]:\//.test(normalizedReported)) {
    return normalizedReported
  }

  const baseDirs = [
    normalizedCompileTargetPath ? dirnamePath(normalizedCompileTargetPath) : '',
    normalizedSourcePath ? dirnamePath(normalizedSourcePath) : '',
    normalizeFsPath(options.workspacePath || ''),
  ].filter(Boolean)

  for (const baseDir of baseDirs) {
    const resolved = resolveRelativePath(baseDir, normalizedReported)
    if (resolved) return resolved
  }

  return normalizedReported
}

export async function waitForLatexEditorView(editorStore, targetPath, timeoutMs = VIEW_WAIT_TIMEOUT_MS) {
  const startedAt = Date.now()
  let targetView = editorStore?.getAnyEditorView?.(targetPath) || null

  while (!targetView && Date.now() - startedAt < timeoutMs) {
    await new Promise(resolve => window.setTimeout(resolve, 16))
    targetView = editorStore?.getAnyEditorView?.(targetPath) || null
  }

  return targetView
}

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

export async function revealLatexSourceLocation(editorStore, location, options = {}) {
  const targetPath = normalizeFsPath(location?.filePath || '')
  const line = Number(location?.line || 0)
  if (!targetPath || !Number.isInteger(line) || line < 1) return false

  const existingPaneId = editorStore?.findPaneWithTab?.(targetPath)?.id || ''
  const preferredPaneId = String(existingPaneId || options.paneId || editorStore?.activePaneId || '')
  if (preferredPaneId && editorStore?.findPane?.(editorStore.paneTree, preferredPaneId)) {
    editorStore?.openFileInPane?.(targetPath, preferredPaneId, { activatePane: true })
  } else {
    editorStore?.openFile?.(targetPath)
  }

  const targetView = await waitForLatexEditorView(
    editorStore,
    targetPath,
    Number(options.timeoutMs || VIEW_WAIT_TIMEOUT_MS),
  )
  if (!targetView) return false

  const resolvedSelection = resolveLatexEditorSelectionFromContext(targetView, location)
  if (resolvedSelection?.from != null) {
    if (targetView?.altalsRevealRange) {
      return targetView.altalsRevealRange(
        resolvedSelection.from,
        resolvedSelection.to,
        options,
      )
    }
    return focusEditorRangeWithHighlight(
      targetView,
      resolvedSelection.from,
      resolvedSelection.to,
      options,
    )
  }

  return focusEditorLineWithHighlight(targetView, line, options)
}
