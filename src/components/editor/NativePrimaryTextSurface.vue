<template>
  <div ref="containerRef" class="native-primary-text-surface">
    <textarea
      ref="textareaRef"
      v-model="draftText"
      class="native-primary-textarea"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      autocorrect="off"
      @input="handleInput"
      @click="handleClick"
      @dblclick="handleDoubleClick"
      @keydown="handleKeydown"
      @keyup="handleSelectionChange"
      @select="handleSelectionChange"
    ></textarea>
    <CitationPalette
      v-if="citPalette.show"
      :mode="citPalette.mode"
      :pos-x="citPalette.x"
      :pos-y="citPalette.y"
      :query="citPalette.query"
      :cites="citPalette.cites"
      :latex-command="citPalette.latexCommand"
      @insert="onCitInsert"
      @update="onCitUpdate"
      @close="onCitClose"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useFilesStore } from '../../stores/files'
import { useEditorStore } from '../../stores/editor'
import { useEditorRuntimeStore } from '../../stores/editorRuntime'
import { useLinksStore } from '../../stores/links'
import { useWorkspaceStore } from '../../stores/workspace'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useLatexStore } from '../../stores/latex'
import {
  createEditorRuntimeContract,
  emitEditorRuntimeTelemetry,
} from '../../domains/editor/editorRuntimeContract'
import { isDraftPath, isMarkdown, isLatexEditorFile } from '../../utils/fileTypes'
import { rememberPendingMarkdownForwardSync } from '../../services/markdown/previewSync.js'
import { revealLatexSourceLocation } from '../../services/latex/previewSync.js'
import { CITATION_GROUP_RE } from '../../editor/citations'
import { LATEX_CITE_RE } from '../../editor/latexCitations'
import CitationPalette from './CitationPalette.vue'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
})

const emit = defineEmits(['cursor-change', 'editor-stats', 'selection-change'])

const files = useFilesStore()
const editorStore = useEditorStore()
const editorRuntimeStore = useEditorRuntimeStore()
const linksStore = useLinksStore()
const workspace = useWorkspaceStore()
const workflowStore = useDocumentWorkflowStore()
const latexStore = useLatexStore()

const containerRef = ref(null)
const textareaRef = ref(null)
const draftText = ref('')

let runtimeHandle = null
let runtimeActive = false
let lastPersistedContent = ''
let suppressInputSync = false
let selectionSyncFrame = null
let autoSaveTimer = null
let markdownCursorRequestHandler = null
let latexCursorRequestHandler = null
let backwardSyncHandler = null

const citPalette = reactive({
  show: false,
  mode: 'insert',
  x: 0,
  y: 0,
  query: '',
  cites: [],
  latexCommand: null,
  triggerFrom: 0,
  triggerTo: 0,
  insideBrackets: false,
  groupFrom: 0,
  groupTo: 0,
})

const isDraftFile = isDraftPath(props.filePath)
const isMarkdownFile = isMarkdown(props.filePath)
const isLatexFile = isLatexEditorFile(props.filePath)
const fileKind = computed(() =>
  isLatexFile ? 'latex' : isMarkdownFile ? 'markdown' : 'text'
)
const nativeDocument = computed(() => editorRuntimeStore.nativeDocuments?.[props.filePath] || null)
const currentContent = computed(() =>
  typeof nativeDocument.value?.text === 'string'
    ? nativeDocument.value.text
    : typeof files.fileContents[props.filePath] === 'string'
      ? files.fileContents[props.filePath]
      : ''
)

function clampOffset(value, length) {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(length, Math.trunc(numeric)))
}

function offsetToLineColumn(text = '', offset = 0) {
  const normalized = String(text || '')
  const safeOffset = clampOffset(offset, normalized.length)
  const slice = normalized.slice(0, safeOffset)
  const lines = slice.split('\n')
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  }
}

function lineColumnToOffset(text = '', line = 1, column = 1) {
  const normalized = String(text || '')
  const targetLine = Math.max(1, Number(line || 1))
  const targetColumn = Math.max(1, Number(column || 1))
  let currentLine = 1
  let index = 0

  while (currentLine < targetLine && index < normalized.length) {
    if (normalized[index] === '\n') {
      currentLine += 1
    }
    index += 1
  }

  return clampOffset(index + targetColumn - 1, normalized.length)
}

function replaceTextRange(from, to, insert) {
  const textarea = textareaRef.value
  if (!textarea) return false
  const safeFrom = clampOffset(from, draftText.value.length)
  const safeTo = clampOffset(to, draftText.value.length)
  const nextText = `${draftText.value.slice(0, safeFrom)}${insert}${draftText.value.slice(safeTo)}`
  suppressInputSync = true
  draftText.value = nextText
  files.setInMemoryFileContent(props.filePath, nextText)
  suppressInputSync = false
  textarea.focus()
  const cursor = safeFrom + String(insert).length
  textarea.setSelectionRange(cursor, cursor)
  void handleInput()
  return true
}

function deriveSelectionPayload() {
  const textarea = textareaRef.value
  if (!textarea) return null
  const from = clampOffset(textarea.selectionStart ?? 0, draftText.value.length)
  const to = clampOffset(textarea.selectionEnd ?? from, draftText.value.length)
  return {
    filePath: props.filePath,
    hasSelection: from !== to,
    anchor: from,
    head: to,
    from,
    to,
    text: from !== to ? draftText.value.slice(from, to) : '',
  }
}

function paletteAnchorPosition() {
  const rect = containerRef.value?.getBoundingClientRect?.()
  return {
    x: Math.round((rect?.left || 0) + 48),
    y: Math.round((rect?.top || 0) + 72),
  }
}

function emitEditorStats() {
  const text = draftText.value
  const selection = deriveSelectionPayload()
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const selWords = selection?.text?.trim() ? selection.text.trim().split(/\s+/).length : 0
  emit('editor-stats', {
    words,
    chars: text.length,
    selWords,
    selChars: selection?.text?.length || 0,
  })
  emitEditorRuntimeTelemetry({
    type: 'editor-stats',
    runtimeKind: 'native-primary',
    paneId: props.paneId,
    filePath: props.filePath,
    words,
    chars: text.length,
    selectedWords: selWords,
    selectedChars: selection?.text?.length || 0,
  })
}

async function syncSelectionToNativeRuntime(payload = null) {
  const selection = payload || deriveSelectionPayload()
  if (!selection) return false
  emit('selection-change', selection)
  emit('cursor-change', {
    offset: selection.head,
  })
  emitEditorRuntimeTelemetry({
    type: 'selection-change',
    runtimeKind: 'native-primary',
    paneId: props.paneId,
    ...selection,
  })
  const cursor = offsetToLineColumn(draftText.value, selection.head)
  emit('cursor-change', {
    offset: selection.head,
    line: cursor.line,
    column: cursor.column,
  })
  await editorRuntimeStore.setNativeSelections({
    path: props.filePath,
    selections: [
      {
        anchor: selection.anchor,
        head: selection.head,
      },
    ],
    viewportOffset: selection.head,
  })
  return true
}

function clearAutoSaveTimer() {
  if (autoSaveTimer != null && typeof window !== 'undefined') {
    window.clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
}

function hasActiveMarkdownPreviewTarget() {
  const workspacePreviewState = workflowStore.getWorkspacePreviewStateForFile(props.filePath)
  if (
    workspacePreviewState?.useWorkspace === true &&
    workspacePreviewState?.previewVisible === true &&
    workspacePreviewState?.previewKind === 'html'
  ) {
    return true
  }
  return workflowStore.hasPreviewForSource(props.filePath, 'html')
}

function hasActiveLatexPdfPreviewTarget() {
  const workspacePreviewState = workflowStore.getWorkspacePreviewStateForFile(props.filePath)
  if (
    workspacePreviewState?.useWorkspace === true &&
    workspacePreviewState?.previewVisible === true &&
    workspacePreviewState?.previewKind === 'pdf'
  ) {
    return true
  }
  const previewPath = workflowStore.getOpenPreviewPathForSource(props.filePath, 'pdf')
  if (!previewPath) return false
  return !!editorStore.findPaneWithTab(previewPath)?.id
}

function dispatchMarkdownForwardSync(source = 'selection-sync') {
  if (!isMarkdownFile || !hasActiveMarkdownPreviewTarget()) return false
  const selection = deriveSelectionPayload()
  if (!selection || selection.hasSelection) return false
  const location = {
    line: offsetToLineColumn(draftText.value, selection.head).line,
    offset: selection.head,
  }
  rememberPendingMarkdownForwardSync({
    sourcePath: props.filePath,
    line: location.line,
    offset: location.offset,
  })
  window.dispatchEvent(
    new CustomEvent('markdown-forward-sync-location', {
      detail: {
        sourcePath: props.filePath,
        line: location.line,
        offset: location.offset,
      },
    })
  )
  emitEditorRuntimeTelemetry({
    type: 'markdown-forward-sync-request',
    runtimeKind: 'native-primary',
    paneId: props.paneId,
    filePath: props.filePath,
    line: location.line,
    offset: location.offset,
    source,
  })
  void editorRuntimeStore.recordNativeWorkflowEvent({
    path: props.filePath,
    event: {
      kind: 'markdown-forward-sync-request',
      line: location.line,
      offset: location.offset,
      source,
    },
  })
  return true
}

function triggerLatexForwardSync(source = 'cursor-request') {
  if (!isLatexFile || !hasActiveLatexPdfPreviewTarget()) return false
  const selection = deriveSelectionPayload()
  if (!selection) return false
  const location = offsetToLineColumn(draftText.value, selection.head)
  emitEditorRuntimeTelemetry({
    type: 'latex-forward-sync-request',
    runtimeKind: 'native-primary',
    paneId: props.paneId,
    filePath: props.filePath,
    line: location.line,
    column: location.column,
    source,
  })
  void editorRuntimeStore.recordNativeWorkflowEvent({
    path: props.filePath,
    event: {
      kind: 'latex-forward-sync-request',
      line: location.line,
      column: location.column,
      source,
    },
  })
  latexStore.requestForwardSync(props.filePath, location.line, location.column)
  return true
}

function scheduleAutoSave() {
  clearAutoSaveTimer()
  if (!workspace.autoSave || isDraftFile) return
  autoSaveTimer = window.setTimeout(() => {
    autoSaveTimer = null
    void persistNativePrimaryContent(draftText.value)
  }, 250)
}

function detectMarkdownCitationTrigger() {
  if (!isMarkdownFile) return null
  const selection = deriveSelectionPayload()
  if (!selection || selection.hasSelection) return null
  const text = draftText.value
  const lineStart = text.lastIndexOf('\n', Math.max(0, selection.head - 1)) + 1
  const lineEndIndex = text.indexOf('\n', selection.head)
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex
  const textBefore = text.slice(lineStart, selection.head)

  const lastBracket = textBefore.lastIndexOf('[')
  let insideBrackets = false
  if (lastBracket !== -1) {
    const afterBracket = textBefore.substring(lastBracket + 1)
    if (!afterBracket.includes(']') && afterBracket.includes('@')) {
      insideBrackets = true
    }
  }

  let atIdx = -1
  if (insideBrackets) {
    const afterBracket = textBefore.substring(lastBracket + 1)
    const lastAt = afterBracket.lastIndexOf('@')
    if (lastAt !== -1) atIdx = lastBracket + 1 + lastAt
  } else {
    const lastAt = textBefore.lastIndexOf('@')
    if (lastAt !== -1) {
      const prev = textBefore[lastAt - 1]
      if (lastAt === 0 || prev === '[' || /\s/.test(prev || '')) {
        if (!textBefore.substring(lastAt).includes(']')) atIdx = lastAt
      }
    }
  }

  if (atIdx === -1) return null
  const absAt = lineStart + atIdx
  const hasBracketBefore = atIdx > 0 && textBefore[atIdx - 1] === '['
  return {
    query: textBefore.substring(atIdx + 1),
    triggerFrom: insideBrackets ? absAt : hasBracketBefore ? absAt - 1 : absAt,
    triggerTo: selection.head,
    insideBrackets,
    latexCommand: null,
  }
}

function detectLatexCitationTrigger() {
  if (!isLatexFile) return null
  const selection = deriveSelectionPayload()
  if (!selection || selection.hasSelection) return null
  const text = draftText.value
  const lineStart = text.lastIndexOf('\n', Math.max(0, selection.head - 1)) + 1
  const textBefore = text.slice(lineStart, selection.head)
  const triggerRe = new RegExp('\\\\\\\\(?:cite[tp]?|citealp|citealt|citeauthor|citeyear|autocite|textcite|parencite|nocite|footcite|fullcite|supercite|smartcite|Cite[tp]?|Parencite|Textcite|Autocite|Smartcite|Footcite|Fullcite)\\{([^}]*)$')
  const match = textBefore.match(triggerRe)
  if (!match) return null
  const fullMatch = match[0]
  const commandMatch = fullMatch.match(/^\\([A-Za-z]+)\{/)
  const commandName = commandMatch?.[1] || 'cite'
  const insideBraces = match[1]
  const lastComma = insideBraces.lastIndexOf(',')
  return {
    query: lastComma >= 0 ? insideBraces.substring(lastComma + 1).trim() : insideBraces.trim(),
    triggerFrom: lastComma >= 0 ? selection.head - (lastComma >= 0 ? (insideBraces.substring(lastComma + 1).trim().length) : 0) : lineStart + textBefore.lastIndexOf(`\\${commandName}`),
    triggerTo: selection.head,
    insideBrackets: lastComma >= 0,
    latexCommand: commandName,
  }
}

function maybeOpenCitationPalette() {
  const trigger = detectLatexCitationTrigger() || detectMarkdownCitationTrigger()
  if (!trigger) {
    if (citPalette.mode === 'insert') citPalette.show = false
    return false
  }
  const anchor = paletteAnchorPosition()
  citPalette.show = true
  citPalette.mode = 'insert'
  citPalette.x = anchor.x
  citPalette.y = anchor.y
  citPalette.query = trigger.query || ''
  citPalette.cites = []
  citPalette.latexCommand = trigger.latexCommand
  citPalette.triggerFrom = trigger.triggerFrom
  citPalette.triggerTo = trigger.triggerTo
  citPalette.insideBrackets = trigger.insideBrackets === true
  return true
}

function parseCitationGroup(text = '') {
  const inner = text.slice(1, -1)
  const parts = inner
    .split(/\s*;\s*|\s*,\s*(?=@)/)
    .map((segment) => segment.trim())
    .filter(Boolean)

  return parts.flatMap((part) => {
    const keyMatch = part.match(/@([a-zA-Z][\w.-]*)/)
    if (!keyMatch) return []
    const key = keyMatch[1]
    const afterKey = part
      .substring(part.indexOf(keyMatch[0]) + keyMatch[0].length)
      .replace(/^[\s,]+/, '')
    const prefix = part.substring(0, part.indexOf(keyMatch[0])).trim()
    return [{ key, locator: afterKey, prefix }]
  })
}

function maybeOpenCitationEditAtSelection() {
  const selection = deriveSelectionPayload()
  if (!selection || selection.hasSelection) return false
  const text = draftText.value
  const lineStart = text.lastIndexOf('\n', Math.max(0, selection.head - 1)) + 1
  const lineEndIndex = text.indexOf('\n', selection.head)
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex
  const lineText = text.slice(lineStart, lineEnd)

  CITATION_GROUP_RE.lastIndex = 0
  let match
  while ((match = CITATION_GROUP_RE.exec(lineText)) !== null) {
    const groupFrom = lineStart + match.index
    const groupTo = groupFrom + match[0].length
    if (selection.head < groupFrom || selection.head > groupTo) continue
    const anchor = paletteAnchorPosition()
    citPalette.show = true
    citPalette.mode = 'edit'
    citPalette.x = anchor.x
    citPalette.y = anchor.y
    citPalette.groupFrom = groupFrom
    citPalette.groupTo = groupTo
    citPalette.cites = parseCitationGroup(match[0])
    citPalette.query = ''
    citPalette.latexCommand = null
    citPalette.insideBrackets = true
    return true
  }

  LATEX_CITE_RE.lastIndex = 0
  while ((match = LATEX_CITE_RE.exec(lineText)) !== null) {
    const groupFrom = lineStart + match.index
    const groupTo = groupFrom + match[0].length
    if (selection.head < groupFrom || selection.head > groupTo) continue
    const anchor = paletteAnchorPosition()
    citPalette.show = true
    citPalette.mode = 'edit'
    citPalette.x = anchor.x
    citPalette.y = anchor.y
    citPalette.groupFrom = groupFrom
    citPalette.groupTo = groupTo
    citPalette.cites = match[2]
      .split(',')
      .map((key) => String(key || '').trim())
      .filter(Boolean)
      .map((key) => ({ key, locator: '', prefix: '' }))
    citPalette.query = ''
    citPalette.latexCommand = match[1]
    citPalette.insideBrackets = true
    return true
  }

  return false
}

function getActiveLineRange(offset) {
  const text = draftText.value
  const safeOffset = clampOffset(offset, text.length)
  const lineStart = text.lastIndexOf('\n', Math.max(0, safeOffset - 1)) + 1
  const lineEndIndex = text.indexOf('\n', safeOffset)
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex
  return {
    lineStart,
    lineEnd,
    lineText: text.slice(lineStart, lineEnd),
  }
}

function maybeHandleWikiLinkClick(event) {
  if (!isMarkdownFile) return false
  const selection = deriveSelectionPayload()
  if (!selection || selection.hasSelection) return false

  const { lineStart, lineText } = getActiveLineRange(selection.head)
  const wikiLinkPattern = /\[\[([^\]]+)\]\]/g
  let match

  while ((match = wikiLinkPattern.exec(lineText)) !== null) {
    const matchFrom = lineStart + match.index
    const matchTo = matchFrom + match[0].length
    if (selection.head < matchFrom || selection.head >= matchTo) continue

    let target = match[1]
    const pipeIndex = target.indexOf('|')
    if (pipeIndex !== -1) target = target.substring(0, pipeIndex)

    const hashIndex = target.indexOf('#')
    if (hashIndex !== -1) target = target.substring(0, hashIndex)

    target = target.trim()
    if (!target) return false

    const resolved = linksStore.resolveLink(target, props.filePath)
    void editorRuntimeStore.recordNativeWorkflowEvent({
      path: props.filePath,
      event: {
        kind: 'wiki-link-open',
        target,
        resolved: !!resolved,
      },
    })

    if (resolved) {
      editorStore.openFile(resolved.path)
    } else {
      const dir = props.filePath.split('/').slice(0, -1).join('/')
      const newName = target.endsWith('.md') ? target : `${target}.md`
      void files.createFile(dir, newName).then((newPath) => {
        if (newPath) editorStore.openFile(newPath)
      })
    }

    event?.preventDefault?.()
    event?.stopPropagation?.()
    return true
  }

  return false
}

function scheduleSelectionSync() {
  if (selectionSyncFrame != null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(selectionSyncFrame)
  }
  if (typeof window === 'undefined') {
    void syncSelectionToNativeRuntime()
    return
  }
  selectionSyncFrame = window.requestAnimationFrame(() => {
    selectionSyncFrame = null
    void syncSelectionToNativeRuntime()
  })
}

async function persistNativePrimaryContent(content = draftText.value) {
  const text = String(content || '')

  if (isDraftFile) {
    const selectedPath = await files.promptAndSaveDraft(props.filePath, text)
    if (!selectedPath) return false
    lastPersistedContent = text
    editorStore.updateFilePath(props.filePath, selectedPath)
    editorStore.clearFileDirty(selectedPath)
    editorRuntimeStore.recordPersistedSnapshot({
      path: selectedPath,
      text,
      fileKind: fileKind.value,
    })
    return true
  }

  const saved = await files.saveFile(props.filePath, text)
  if (!saved) return false
  lastPersistedContent = text
  editorStore.clearFileDirty(props.filePath)
  editorRuntimeStore.recordPersistedSnapshot({
    path: props.filePath,
    text,
    fileKind: fileKind.value,
  })
  void editorRuntimeStore.recordNativeWorkflowEvent({
    path: props.filePath,
    event: {
      kind: 'persist-document',
      format: fileKind.value,
      textLength: text.length,
    },
  })
  return true
}

async function handleInput() {
  if (suppressInputSync) return
  const text = draftText.value
  files.setInMemoryFileContent(props.filePath, text)
  editorRuntimeStore.beginTypingLatencyProbe({
    path: props.filePath,
    text,
    fileKind: fileKind.value,
  })
  await editorRuntimeStore.replaceNativeDocumentText({
    path: props.filePath,
    text,
  })
  if (text === lastPersistedContent) {
    editorStore.clearFileDirty(props.filePath)
  } else {
    editorStore.markFileDirty(props.filePath)
  }
  emitEditorRuntimeTelemetry({
    type: 'content-change',
    runtimeKind: 'native-primary',
    paneId: props.paneId,
    filePath: props.filePath,
    textLength: text.length,
  })
  emitEditorStats()
  scheduleSelectionSync()
  dispatchMarkdownForwardSync('selection-sync')
  scheduleAutoSave()
  maybeOpenCitationPalette()
}

function handleSelectionChange() {
  scheduleSelectionSync()
  dispatchMarkdownForwardSync('selection-sync')
}

function handleClick(event) {
  handleSelectionChange()
  if (maybeHandleWikiLinkClick(event)) return
  if (!maybeOpenCitationEditAtSelection()) {
    maybeOpenCitationPalette()
  }
}

function handleDoubleClick() {
  if (isLatexFile) {
    triggerLatexForwardSync('double-click')
  }
}

function handleKeydown(event) {
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '')
  const modKey = isMac ? event.metaKey : event.ctrlKey
  if (modKey && String(event.key || '').toLowerCase() === 's') {
    event.preventDefault()
    void persistNativePrimaryContent(draftText.value)
  }
}

function applyExternalContent(nextContent = '') {
  const text = String(nextContent || '')
  suppressInputSync = true
  draftText.value = text
  files.setInMemoryFileContent(props.filePath, text)
  suppressInputSync = false
  return editorRuntimeStore.replaceNativeDocumentText({
    path: props.filePath,
    text,
  })
}

function onCitInsert({ keys = [], stayOpen = false, latexCommand = null }) {
  if (keys.length === 0) return
  const key = keys[0]
  if (isLatexFile && latexCommand) {
    const text = citPalette.insideBrackets ? key : `\\${latexCommand}{${key}}`
    replaceTextRange(citPalette.triggerFrom, citPalette.triggerTo, text)
  } else {
    const text = citPalette.insideBrackets ? `@${key}` : `[@${key}]`
    replaceTextRange(citPalette.triggerFrom, citPalette.triggerTo, text)
  }

  void editorRuntimeStore.recordNativeWorkflowEvent({
    path: props.filePath,
    event: {
      kind: 'citation-insert',
      keys: [...keys],
      stayOpen: stayOpen === true,
      latexCommand: latexCommand || null,
    },
  })

  if (stayOpen && !isLatexFile) {
    maybeOpenCitationEditAtSelection()
    return
  }
  citPalette.show = false
}

function onCitUpdate({ cites = [] }) {
  if (isLatexFile) {
    const keys = cites.map((cite) => cite.key)
    const command = citPalette.latexCommand || 'cite'
    const text = `\\${command}{${keys.join(', ')}}`
    replaceTextRange(citPalette.groupFrom, citPalette.groupTo, text)
    citPalette.groupTo = citPalette.groupFrom + text.length
    void editorRuntimeStore.recordNativeWorkflowEvent({
      path: props.filePath,
      event: {
        kind: 'citation-update',
        mode: 'latex',
        keys,
        latexCommand: command,
      },
    })
    return
  }

  if (cites.length === 0) {
    replaceTextRange(citPalette.groupFrom, citPalette.groupTo, '')
    citPalette.show = false
    void editorRuntimeStore.recordNativeWorkflowEvent({
      path: props.filePath,
      event: {
        kind: 'citation-update',
        mode: 'markdown',
        keys: [],
      },
    })
    return
  }

  const parts = cites.map((cite) => {
    let part = ''
    if (cite.prefix) part += `${cite.prefix} `
    part += `@${cite.key}`
    if (cite.locator) part += `, ${cite.locator}`
    return part
  })
  const text = `[${parts.join('; ')}]`
  replaceTextRange(citPalette.groupFrom, citPalette.groupTo, text)
  citPalette.groupTo = citPalette.groupFrom + text.length
  void editorRuntimeStore.recordNativeWorkflowEvent({
    path: props.filePath,
    event: {
      kind: 'citation-update',
      mode: 'markdown',
      keys: cites.map((cite) => cite.key),
    },
  })
}

function onCitClose() {
  citPalette.show = false
  textareaRef.value?.focus?.()
}

function revealRange(from, to = from, options = {}) {
  const textarea = textareaRef.value
  if (!textarea) return false
  const safeFrom = clampOffset(from, draftText.value.length)
  const safeTo = clampOffset(to, draftText.value.length)
  textarea.focus()
  textarea.setSelectionRange(safeFrom, safeTo)
  if (options.focus === false) {
    textarea.blur()
  }
  void editorRuntimeStore.recordNativeWorkflowEvent({
    path: props.filePath,
    event: {
      kind: 'reveal-range',
      from: safeFrom,
      to: safeTo,
      source: 'native-primary',
    },
  })
  scheduleSelectionSync()
  return true
}

function setDiagnostics(diagnostics = []) {
  void editorRuntimeStore.setNativeDiagnostics({
    path: props.filePath,
    diagnostics: Array.isArray(diagnostics) ? diagnostics : [],
  })
  return true
}

function setOutlineContext(context = null) {
  void editorRuntimeStore.setNativeOutlineContext({
    path: props.filePath,
    context,
  })
  return true
}

function registerRuntime() {
  if (runtimeActive) return
  runtimeActive = true
  runtimeHandle = createEditorRuntimeContract({
    runtimeKind: 'native-primary',
    paneId: props.paneId,
    filePath: props.filePath,
    getView: () => ({
      focus: () => textareaRef.value?.focus?.(),
    }),
    getContent: () => draftText.value,
    persistContent: () => persistNativePrimaryContent(draftText.value),
    applyExternalContent,
    requestSelection: deriveSelectionPayload,
    revealOffset: (offset, options = {}) => revealRange(offset, offset, options),
    revealRange,
    setDiagnostics,
    setOutlineContext,
    dispose: () => {
      runtimeActive = false
      editorStore.unregisterEditorRuntime(props.paneId, props.filePath)
      return true
    },
  })
  editorStore.registerEditorRuntime(props.paneId, props.filePath, runtimeHandle)
}

function attachWindowWorkflowListeners() {
  if (typeof window === 'undefined') return
  if (isMarkdownFile && !markdownCursorRequestHandler) {
    markdownCursorRequestHandler = (event) => {
      if (event.detail?.sourcePath !== props.filePath) return
      dispatchMarkdownForwardSync('cursor-request')
    }
    window.addEventListener('markdown-request-cursor', markdownCursorRequestHandler)
  }

  if (isLatexFile && !latexCursorRequestHandler) {
    latexCursorRequestHandler = (event) => {
      if (event.detail?.texPath !== props.filePath) return
      triggerLatexForwardSync('cursor-request')
    }
    window.addEventListener('latex-request-cursor', latexCursorRequestHandler)
  }

  if (isLatexFile && !backwardSyncHandler) {
    backwardSyncHandler = async (event) => {
      const detail = event.detail || {}
      const targetFile = String(detail.file || detail.filePath || '').replace(/\\/g, '/')
      const currentFile = String(props.filePath || '').replace(/\\/g, '/')
      if (targetFile && targetFile !== currentFile) {
        await revealLatexSourceLocation(editorStore, {
          ...detail,
          filePath: targetFile,
        }, {
          paneId: props.paneId,
          center: true,
        })
        return
      }
      const offset = lineColumnToOffset(draftText.value, detail.line, detail.column)
      revealRange(offset, offset, { focus: true, center: true })
      void editorRuntimeStore.recordNativeWorkflowEvent({
        path: props.filePath,
        event: {
          kind: 'latex-backward-sync-reveal',
          targetFilePath: targetFile || currentFile,
          line: Number(detail.line || 0),
          column: Number(detail.column || 0),
          scope: 'current-file',
        },
      })
    }
    window.addEventListener('latex-backward-sync', backwardSyncHandler)
  }
}

function detachWindowWorkflowListeners() {
  if (typeof window === 'undefined') return
  if (markdownCursorRequestHandler) {
    window.removeEventListener('markdown-request-cursor', markdownCursorRequestHandler)
    markdownCursorRequestHandler = null
  }
  if (latexCursorRequestHandler) {
    window.removeEventListener('latex-request-cursor', latexCursorRequestHandler)
    latexCursorRequestHandler = null
  }
  if (backwardSyncHandler) {
    window.removeEventListener('latex-backward-sync', backwardSyncHandler)
    backwardSyncHandler = null
  }
}

watch(
  currentContent,
  (value) => {
    const text = String(value || '')
    if (text === draftText.value) return
    suppressInputSync = true
    draftText.value = text
    files.setInMemoryFileContent(props.filePath, text)
    suppressInputSync = false
    emitEditorStats()
  },
  { immediate: true }
)

watch(
  nativeDocument,
  (document) => {
    const cursor = document?.cursor || null
    if (!cursor) return
    emit('cursor-change', {
      offset: Number(cursor.offset || 0),
      line: Number(cursor.line || 0),
      column: Number(cursor.column || 0),
    })
  },
  { deep: true, immediate: true }
)

onMounted(async () => {
  let content = files.fileContents[props.filePath]
  if (content === undefined) {
    content = isDraftFile ? '' : await files.readFile(props.filePath)
  }
  if (content == null) content = ''

  draftText.value = String(content)
  lastPersistedContent = draftText.value
  editorStore.clearFileDirty(props.filePath)
  editorRuntimeStore.verifyReopenSnapshot({
    path: props.filePath,
    text: draftText.value,
    fileKind: fileKind.value,
  })
  await editorRuntimeStore.syncShadowDocument({
    path: props.filePath,
    text: draftText.value,
  })
  registerRuntime()
  attachWindowWorkflowListeners()
  emitEditorStats()
  await nextTick()
  scheduleSelectionSync()
})

onUnmounted(() => {
  if (selectionSyncFrame != null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(selectionSyncFrame)
    selectionSyncFrame = null
  }
  clearAutoSaveTimer()
  detachWindowWorkflowListeners()
  runtimeHandle?.destroy?.()
  runtimeHandle = null
})

defineExpose({
  getBoundingClientRect() {
    return containerRef.value?.getBoundingClientRect?.() || null
  },
})
</script>

<style scoped>
.native-primary-text-surface {
  display: flex;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--shell-editor-surface);
}

.native-primary-textarea {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  resize: none;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  padding: 28px 32px 48px;
  font: inherit;
  line-height: 1.7;
}
</style>
