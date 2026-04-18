import { emitEditorRuntimeTelemetry } from './editorRuntimeContract'

export function normalizeNativeCitationEntries(cites = []) {
  return Array.isArray(cites)
    ? cites.map((cite) => ({
        key: String(cite?.key || ''),
        locator: String(cite?.locator || ''),
        prefix: String(cite?.prefix || ''),
      }))
    : []
}

export function buildNativePrimaryEditorStats(text = '', selection = null) {
  const normalizedText = String(text || '')
  const selectedText = String(selection?.text || '')
  const words = normalizedText.trim() ? normalizedText.trim().split(/\s+/).length : 0
  const selWords = selectedText.trim() ? selectedText.trim().split(/\s+/).length : 0
  return {
    words,
    chars: normalizedText.length,
    selWords,
    selChars: selectedText.length,
  }
}

export function buildNativePrimaryCursorSnapshot(text = '', selection = null) {
  const normalizedText = String(text || '')
  const head = Number(selection?.head || 0)
  const safeOffset = Math.max(0, Math.min(normalizedText.length, Math.trunc(head)))
  const slice = normalizedText.slice(0, safeOffset)
  const lines = slice.split('\n')
  return {
    offset: safeOffset,
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  }
}

function ensureSegmentBoundary(boundaries, index) {
  const numeric = Number(index || 0)
  if (!Number.isFinite(numeric)) return
  boundaries.add(Math.max(0, Math.trunc(numeric)))
}

function normalizeMarkRange(mark = {}) {
  const from = Math.max(0, Math.trunc(Number(mark?.from || 0)))
  const to = Math.max(from, Math.trunc(Number(mark?.to || from)))
  return { from, to }
}

export function buildNativePrimaryPresentationLines(snapshot = null) {
  const lines = Array.isArray(snapshot?.lines) ? snapshot.lines : []
  const marks = Array.isArray(snapshot?.marks) ? snapshot.marks : []
  const activeLine = Number(snapshot?.activeLine || 0)

  return lines.map((line) => {
    const lineFrom = Math.max(0, Math.trunc(Number(line?.from || 0)))
    const lineTo = Math.max(lineFrom, Math.trunc(Number(line?.to || lineFrom)))
    const text = String(line?.text || '')
    const lineMarks = marks
      .filter((mark) => {
        const range = normalizeMarkRange(mark)
        return range.to > lineFrom && range.from < lineTo
      })
      .map((mark) => ({
        ...mark,
        ...normalizeMarkRange(mark),
      }))

    const boundaries = new Set([lineFrom, lineTo])
    lineMarks.forEach((mark) => {
      ensureSegmentBoundary(boundaries, Math.max(lineFrom, mark.from))
      ensureSegmentBoundary(boundaries, Math.min(lineTo, mark.to))
    })

    const ordered = [...boundaries].sort((left, right) => left - right)
    const segments = []

    for (let index = 0; index < ordered.length - 1; index += 1) {
      const from = ordered[index]
      const to = ordered[index + 1]
      if (to <= from) continue
      const relativeFrom = from - lineFrom
      const relativeTo = to - lineFrom
      const segmentText = text.slice(relativeFrom, relativeTo)
      const classes = lineMarks
        .filter((mark) => mark.from < to && mark.to > from)
        .map((mark) => String(mark?.className || '').trim())
        .filter(Boolean)

      segments.push({
        from,
        to,
        text: segmentText,
        classes,
        className: classes.join(' '),
      })
    }

    if (segments.length === 0) {
      segments.push({
        from: lineFrom,
        to: lineTo,
        text,
        classes: [],
        className: '',
      })
    }

    return {
      line: Number(line?.line || 0),
      from: lineFrom,
      to: lineTo,
      text,
      isActive: activeLine > 0 && Number(line?.line || 0) === activeLine,
      segments,
    }
  })
}

export function buildNativePrimaryMarkdownForwardSyncRequest({
  isMarkdownFile = false,
  selection = null,
  text = '',
  filePath = '',
  source = 'selection-sync',
} = {}) {
  if (!isMarkdownFile || !selection || selection.hasSelection) return null
  const cursor = buildNativePrimaryCursorSnapshot(text, selection)
  return {
    sourcePath: filePath,
    line: cursor.line,
    offset: cursor.offset,
    source,
  }
}

export function buildNativePrimaryLatexForwardSyncRequest({
  isLatexFile = false,
  selection = null,
  text = '',
  filePath = '',
  source = 'cursor-request',
} = {}) {
  if (!isLatexFile || !selection) return null
  const cursor = buildNativePrimaryCursorSnapshot(text, selection)
  return {
    filePath,
    line: cursor.line,
    column: cursor.column,
    source,
  }
}

export function applyNativeCitationTriggerState(citPalette, anchor, trigger = null) {
  if (!citPalette) return false
  if (!trigger) {
    if (citPalette.mode === 'insert') citPalette.show = false
    return false
  }
  citPalette.show = true
  citPalette.mode = 'insert'
  citPalette.x = anchor.x
  citPalette.y = anchor.y
  citPalette.query = trigger.query || ''
  citPalette.cites = []
  citPalette.latexCommand = trigger.latexCommand || null
  citPalette.triggerFrom = Number(trigger.triggerFrom || 0)
  citPalette.triggerTo = Number(trigger.triggerTo || 0)
  citPalette.insideBrackets = trigger.insideBrackets === true
  return true
}

export function applyNativeCitationEditState(citPalette, anchor, context = null, hasSelection = false) {
  if (!citPalette || hasSelection) return false
  const edit = context?.citationEdit || null
  if (!edit) return false
  citPalette.show = true
  citPalette.mode = 'edit'
  citPalette.x = anchor.x
  citPalette.y = anchor.y
  citPalette.groupFrom = Number(edit.groupFrom || 0)
  citPalette.groupTo = Number(edit.groupTo || 0)
  citPalette.cites = normalizeNativeCitationEntries(edit.cites)
  citPalette.query = ''
  citPalette.latexCommand = edit.latexCommand || null
  citPalette.insideBrackets = true
  return true
}

export async function inspectNativePrimaryInteractionContext({
  editorRuntimeStore,
  path = '',
  text = '',
  selection = null,
} = {}) {
  if (!editorRuntimeStore) return null
  return editorRuntimeStore.inspectNativeInteractionContext({
    path,
    text,
    selection,
  })
}

export async function planNativePrimaryCitationReplacement({
  editorRuntimeStore,
  path = '',
  citPalette,
  operation = '',
  keys = [],
  cites = [],
  latexCommand = null,
} = {}) {
  if (!editorRuntimeStore || !citPalette) return null
  return editorRuntimeStore.planNativeCitationReplacement({
    path,
    operation,
    trigger:
      citPalette.mode === 'insert'
        ? {
            query: citPalette.query,
            triggerFrom: citPalette.triggerFrom,
            triggerTo: citPalette.triggerTo,
            insideBrackets: citPalette.insideBrackets === true,
            latexCommand: citPalette.latexCommand || null,
          }
        : null,
    edit:
      citPalette.mode === 'edit'
        ? {
            groupFrom: citPalette.groupFrom,
            groupTo: citPalette.groupTo,
            cites: normalizeNativeCitationEntries(citPalette.cites),
            latexCommand: citPalette.latexCommand || null,
          }
        : null,
    keys: Array.isArray(keys) ? keys : [],
    cites: normalizeNativeCitationEntries(cites),
    latexCommand,
  })
}

export async function resolveNativeWikiLinkInteraction({
  context = null,
  filePath = '',
  linksStore,
  editorStore,
  files,
  recordWorkflowEvent = null,
  event = null,
} = {}) {
  const wikiLink = context?.wikiLink || null
  if (!wikiLink?.target || !filePath || !linksStore || !editorStore || !files) return false

  const resolved = linksStore.resolveLink(wikiLink.target, filePath)
  if (typeof recordWorkflowEvent === 'function') {
    await recordWorkflowEvent({
      kind: 'wiki-link-open',
      target: wikiLink.target,
      resolved: !!resolved,
    })
  }

  if (resolved) {
    editorStore.openFile(resolved.path)
  } else {
    const dir = filePath.split('/').slice(0, -1).join('/')
    const newName = wikiLink.target.endsWith('.md') ? wikiLink.target : `${wikiLink.target}.md`
    const newPath = await files.createFile(dir, newName)
    if (newPath) editorStore.openFile(newPath)
  }

  event?.preventDefault?.()
  event?.stopPropagation?.()
  return true
}

export async function handleNativePrimaryClickInteraction({
  event = null,
  context = null,
  isMarkdownFile = false,
  resolveWikiLinkInteraction,
  applyCitationEditContext,
  applyCitationTrigger,
} = {}) {
  if (
    isMarkdownFile &&
    typeof resolveWikiLinkInteraction === 'function' &&
    (await resolveWikiLinkInteraction(event, context))
  ) {
    return { handled: true, outcome: 'wiki-link' }
  }

  if (typeof applyCitationEditContext === 'function' && applyCitationEditContext(context)) {
    return { handled: true, outcome: 'citation-edit' }
  }

  if (typeof applyCitationTrigger === 'function') {
    applyCitationTrigger(context?.citationTrigger || null)
    return { handled: true, outcome: context?.citationTrigger ? 'citation-trigger' : 'none' }
  }

  return { handled: false, outcome: 'none' }
}

export async function applyNativePrimaryInputChange({
  text = '',
  filePath = '',
  fileKind = 'text',
  paneId = '',
  lastPersistedContent = '',
  files,
  editorStore,
  editorRuntimeStore,
} = {}) {
  const normalizedText = String(text || '')
  files?.setInMemoryFileContent?.(filePath, normalizedText)
  editorRuntimeStore?.beginTypingLatencyProbe?.({
    path: filePath,
    text: normalizedText,
    fileKind,
  })
  await editorRuntimeStore?.replaceNativeDocumentText?.({
    path: filePath,
    text: normalizedText,
  })

  const isDirty = normalizedText !== String(lastPersistedContent || '')
  if (isDirty) {
    editorStore?.markFileDirty?.(filePath)
  } else {
    editorStore?.clearFileDirty?.(filePath)
  }

  emitEditorRuntimeTelemetry({
    type: 'content-change',
    runtimeKind: 'native-primary',
    paneId,
    filePath,
    textLength: normalizedText.length,
  })

  return {
    isDirty,
    text: normalizedText,
  }
}

export async function persistNativePrimaryDocument({
  text = '',
  filePath = '',
  fileKind = 'text',
  isDraftFile = false,
  files,
  editorStore,
  editorRuntimeStore,
} = {}) {
  const normalizedText = String(text || '')

  if (isDraftFile) {
    const selectedPath = await files?.promptAndSaveDraft?.(filePath, normalizedText)
    if (!selectedPath) return { persisted: false, path: filePath, text: normalizedText }
    editorStore?.updateFilePath?.(filePath, selectedPath)
    editorStore?.clearFileDirty?.(selectedPath)
    editorRuntimeStore?.recordPersistedSnapshot?.({
      path: selectedPath,
      text: normalizedText,
      fileKind,
    })
    return {
      persisted: true,
      path: selectedPath,
      text: normalizedText,
      workflowEvent: null,
    }
  }

  const saved = await files?.saveFile?.(filePath, normalizedText)
  if (!saved) return { persisted: false, path: filePath, text: normalizedText }
  editorStore?.clearFileDirty?.(filePath)
  editorRuntimeStore?.recordPersistedSnapshot?.({
    path: filePath,
    text: normalizedText,
    fileKind,
  })
  const workflowEvent = {
    kind: 'persist-document',
    format: fileKind,
    textLength: normalizedText.length,
  }
  await editorRuntimeStore?.recordNativeWorkflowEvent?.({
    path: filePath,
    event: workflowEvent,
  })
  return {
    persisted: true,
    path: filePath,
    text: normalizedText,
    workflowEvent,
  }
}
