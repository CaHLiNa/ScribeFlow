import { buildCitationText } from '../../editor/citationSyntax'
import { buildExecutionResultSnippet } from '../../services/executionResultInsert'
import { getRegisteredEditorView } from './editorViewRegistry'

function fileBasename(path) {
  return String(path || '').split('/').pop() || ''
}

function buildResearchSourceLine(targetPath, note = {}, annotation = null) {
  const sourceRef = note?.sourceRef || annotation?.sourceRef || {}
  const parts = []
  const page = Number(annotation?.page || sourceRef?.page || 0)
  if (Number.isInteger(page) && page > 0) {
    parts.push(`page ${page}`)
  }
  const referenceKey = annotation?.referenceKey || sourceRef?.referenceKey || null
  if (referenceKey) {
    parts.push(buildCitationText(targetPath, referenceKey))
  } else if (sourceRef?.pdfPath) {
    parts.push(fileBasename(sourceRef.pdfPath))
  }
  const sourceId = sourceRef?.annotationId || annotation?.id || null
  if (sourceId) {
    parts.push(`source_ref: ${sourceId}`)
  }
  return parts.join(' | ')
}

function buildTextResearchNoteSnippet(targetPath, note = {}, annotation = null) {
  const quote = String(note?.quote || annotation?.quote || '').trim()
  const comment = String(note?.comment || '').trim()
  const sourceLine = buildResearchSourceLine(targetPath, note, annotation)
  const sourceRefPayload = note?.sourceRef || null

  const segments = []
  if (quote) {
    segments.push(
      quote
        .split(/\r?\n/)
        .map((line) => `> ${line}`)
        .join('\n'),
    )
  }
  if (comment) {
    segments.push(`Note: ${comment}`)
  }
  if (sourceLine) {
    segments.push(`Source: ${sourceLine}`)
  }
  if (sourceRefPayload) {
    segments.push(`<!-- source_ref: ${JSON.stringify(sourceRefPayload)} -->`)
  }

  return `\n\n${segments.join('\n\n')}\n\n`
}

export function insertResearchNoteIntoEditor({
  target,
  editorViews,
  note,
  annotation = null,
} = {}) {
  if (!target) {
    return {
      ok: false,
      reason: 'no-target',
    }
  }

  if (target.viewerType !== 'text') {
    return {
      ok: false,
      reason: 'unsupported-target',
      ...target,
    }
  }

  const view = getRegisteredEditorView(editorViews, target.paneId, target.path)
  if (!view?.state) {
    return { ok: false, reason: 'missing-editor-view', ...target }
  }

  const selection = view.state.selection.main
  const snippet = buildTextResearchNoteSnippet(target.path, note, annotation)
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: snippet },
    selection: { anchor: selection.from + snippet.length },
    scrollIntoView: true,
  })
  view.focus?.()

  return {
    ok: true,
    ...target,
  }
}

export async function insertExecutionResultIntoEditor({
  target,
  editorViews,
  outputs = [],
  provenance = {},
} = {}) {
  if (!target) {
    return {
      ok: false,
      reason: 'no-target',
    }
  }

  const view = getRegisteredEditorView(editorViews, target.paneId, target.path)
  if (!view?.state) {
    return {
      ok: false,
      reason: 'missing-editor-view',
      ...target,
    }
  }

  const snippetResult = await buildExecutionResultSnippet(target.path, outputs, provenance)
  if (!snippetResult.ok) {
    return {
      ok: false,
      reason: snippetResult.reason,
      ...target,
    }
  }

  const selection = view.state.selection.main
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: snippetResult.snippet },
    selection: { anchor: selection.from + snippetResult.snippet.length },
    scrollIntoView: true,
  })
  view.focus?.()

  return {
    ok: true,
    ...target,
  }
}
