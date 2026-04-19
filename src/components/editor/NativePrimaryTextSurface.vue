<template>
  <div ref="containerRef" class="native-primary-text-surface">
    <div class="native-primary-text-chrome">
      <div class="native-primary-gutter" aria-hidden="true">
        <div class="native-primary-gutter-scroll" :style="gutterScrollStyle">
          <div
            v-for="line in presentationLines"
            :key="`gutter-${line.line}-${line.from}`"
            class="native-primary-gutter-line"
            :class="{ 'is-active': line.isActive }"
          >
            {{ line.line }}
          </div>
        </div>
      </div>
      <div
        ref="scrollerRef"
        class="native-primary-editor-scroller"
        @scroll="handleScroll"
        @mousedown="handleSurfaceMouseDown"
        @click="handleSurfaceClick"
        @dblclick="handleSurfaceDoubleClick"
      >
        <div class="native-primary-editor-canvas" :style="editorCanvasStyle">
          <div class="native-primary-selection-layer" aria-hidden="true">
            <div
              v-for="block in selectionBlocks"
              :key="block.key"
              class="native-primary-selection-block"
              :style="selectionBlockStyle(block)"
            ></div>
          </div>
          <div class="native-primary-line-layer" aria-hidden="true">
            <div
              v-for="(line, index) in presentationLines"
              :key="`line-${line.line}-${line.from}`"
              class="native-primary-line"
              :class="{ 'is-active': line.isActive }"
              :style="lineStyle(index)"
            >
              <span
                v-for="segment in line.segments"
                :key="`segment-${segment.from}-${segment.to}`"
                class="native-primary-segment"
                :class="segment.className"
              >
                {{ segment.text || '\u200b' }}
              </span>
            </div>
          </div>
          <div
            v-if="caretVisual && isInputFocused && !selectionState.hasSelection"
            class="native-primary-caret"
            :style="caretStyle"
            aria-hidden="true"
          ></div>
          <textarea
            ref="textareaRef"
            v-model="draftText"
            class="native-primary-input-bridge"
            :style="inputBridgeStyle"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            wrap="off"
            @input="handleInput"
            @keydown="handleKeydown"
            @keyup="handleBridgeSelectionChange"
            @select="handleBridgeSelectionChange"
            @focus="handleBridgeFocus"
            @blur="handleBridgeBlur"
            @compositionstart="handleCompositionStart"
            @compositionend="handleCompositionEnd"
          ></textarea>
        </div>
      </div>
    </div>
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
import {
  buildNativePrimaryFallbackLineNumbers,
  buildNativePrimarySelectionPayload,
  buildNativePrimarySelectionBlocks,
  buildNativePrimaryCaretVisual,
  clampNativePrimaryOffset,
  computeNativePrimaryContentHeight,
  computeNativePrimaryContentWidth,
  NATIVE_PRIMARY_LAYOUT,
  resolveNativePrimaryOffsetAtPoint,
  selectNativePrimaryWord,
} from '../../domains/editor/nativePrimaryHostRuntime'
import {
  applyNativePrimaryInputChange,
  applyNativeCitationEditState,
  applyNativeCitationTriggerState,
  buildNativePrimaryPresentationLines,
  buildNativePrimaryCursorSnapshot,
  buildNativePrimaryEditorStats,
  buildNativePrimaryLatexForwardSyncRequest,
  buildNativePrimaryMarkdownForwardSyncRequest,
  handleNativePrimaryClickInteraction,
  inspectNativePrimaryInteractionContext,
  normalizeNativeCitationEntries,
  planNativePrimaryCitationReplacement,
  persistNativePrimaryDocument,
  resolveNativeWikiLinkInteraction,
} from '../../domains/editor/nativePrimarySurfaceRuntime'
import { isDraftPath, isMarkdown, isLatexEditorFile } from '../../utils/fileTypes'
import { rememberPendingMarkdownForwardSync } from '../../services/markdown/previewSync.js'
import { revealLatexSourceLocation } from '../../services/latex/previewSync.js'
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
const scrollerRef = ref(null)
const textareaRef = ref(null)
const draftText = ref('')
const scrollTop = ref(0)
const scrollLeft = ref(0)
const selectionAnchor = ref(0)
const selectionHead = ref(0)
const isInputFocused = ref(false)
const isComposing = ref(false)

let runtimeHandle = null
let runtimeActive = false
let lastPersistedContent = ''
let suppressInputSync = false
let selectionSyncFrame = null
let autoSaveTimer = null
let markdownCursorRequestHandler = null
let latexCursorRequestHandler = null
let backwardSyncHandler = null
let fileTreeDragStartHandler = null
let fileTreeDragEndHandler = null
let draggedFilePaths = []
let pointerAnchorOffset = null
let pointerSelecting = false
let pointerSelectionMoved = false
let textMeasureContext = null
const textWidthCache = new Map()

const AUTO_PAIR_INPUTS = new Set(['(', ')', '[', ']', '{', '}', '<', '>', '"', "'", '`'])

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
const fileKind = computed(() => (isLatexFile ? 'latex' : isMarkdownFile ? 'markdown' : 'text'))
const nativeDocument = computed(() => editorRuntimeStore.nativeDocuments?.[props.filePath] || null)
const nativeSnapshotFresh = computed(
  () =>
    typeof nativeDocument.value?.text === 'string' &&
    nativeDocument.value.text === draftText.value
)
const currentContent = computed(() =>
  typeof nativeDocument.value?.text === 'string'
    ? nativeDocument.value.text
    : typeof files.fileContents[props.filePath] === 'string'
      ? files.fileContents[props.filePath]
      : ''
)
const lineNumbers = computed(() =>
  nativeSnapshotFresh.value &&
  Array.isArray(nativeDocument.value?.lineNumbers) &&
  nativeDocument.value.lineNumbers.length > 0
    ? nativeDocument.value.lineNumbers
    : buildNativePrimaryFallbackLineNumbers(draftText.value)
)
const selectionState = computed(() =>
  buildNativePrimarySelectionPayload({
    filePath: props.filePath,
    text: draftText.value,
    anchor: selectionAnchor.value,
    head: selectionHead.value,
  })
)
const cursorState = computed(() =>
  buildNativePrimaryCursorSnapshot(draftText.value, selectionState.value)
)
const presentationSnapshot = computed(() => ({
  text: draftText.value,
  lineNumbers: lineNumbers.value,
  syntaxSpans:
    isMarkdownFile && nativeSnapshotFresh.value ? nativeDocument.value?.syntaxSpans || [] : [],
  delimiterMatch:
    isMarkdownFile && nativeSnapshotFresh.value ? nativeDocument.value?.delimiterMatch || null : null,
  activeLine: Number(cursorState.value?.line || 0),
}))
const presentationLines = computed(() => buildNativePrimaryPresentationLines(presentationSnapshot.value))
const selectionBlocks = computed(() =>
  buildNativePrimarySelectionBlocks({
    text: draftText.value,
    lineNumbers: lineNumbers.value,
    anchor: selectionAnchor.value,
    head: selectionHead.value,
    layout: NATIVE_PRIMARY_LAYOUT,
    measureTextWidth,
  })
)
const caretVisual = computed(() =>
  buildNativePrimaryCaretVisual({
    text: draftText.value,
    lineNumbers: lineNumbers.value,
    offset: selectionHead.value,
    layout: NATIVE_PRIMARY_LAYOUT,
    measureTextWidth,
  })
)
const contentWidth = computed(() =>
  computeNativePrimaryContentWidth({
    lines: presentationLines.value,
    layout: NATIVE_PRIMARY_LAYOUT,
    measureTextWidth,
  })
)
const contentHeight = computed(() =>
  computeNativePrimaryContentHeight({
    lineCount: presentationLines.value.length,
    layout: NATIVE_PRIMARY_LAYOUT,
  })
)
const gutterScrollStyle = computed(() => ({
  transform: `translateY(${-scrollTop.value}px)`,
}))
const editorCanvasStyle = computed(() => ({
  minWidth: '100%',
  width: `${contentWidth.value}px`,
  height: `${contentHeight.value}px`,
}))
const caretStyle = computed(() =>
  caretVisual.value
    ? {
        left: `${caretVisual.value.left}px`,
        top: `${caretVisual.value.top}px`,
        height: `${caretVisual.value.height}px`,
      }
    : {}
)
const inputBridgeStyle = computed(() =>
  caretVisual.value
    ? {
        left: `${caretVisual.value.left}px`,
        top: `${caretVisual.value.top}px`,
        height: `${caretVisual.value.height}px`,
      }
    : {
        left: `${NATIVE_PRIMARY_LAYOUT.paddingLeft}px`,
        top: `${NATIVE_PRIMARY_LAYOUT.paddingTop}px`,
        height: `${NATIVE_PRIMARY_LAYOUT.lineHeight}px`,
      }
)

function ensureTextMeasureContext() {
  if (textMeasureContext) return textMeasureContext
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  textMeasureContext = canvas.getContext('2d')
  resetTextMeasureContext()
  return textMeasureContext
}

function resetTextMeasureContext() {
  if (typeof window === 'undefined') return
  const context = ensureTextMeasureContext()
  if (!context) return
  const computedStyle = window.getComputedStyle(containerRef.value || document.documentElement)
  const fontSize = computedStyle.getPropertyValue('--editor-font-size').trim() || '14px'
  const fontFamily = computedStyle.getPropertyValue('--font-mono').trim() || 'monospace'
  context.font = `${fontSize} ${fontFamily}`
  textWidthCache.clear()
}

function measureTextWidth(value = '') {
  const normalized = String(value || '')
  const cached = textWidthCache.get(normalized)
  if (typeof cached === 'number') return cached
  const context = ensureTextMeasureContext()
  const width = context ? context.measureText(normalized).width : normalized.length * 8.4
  textWidthCache.set(normalized, width)
  return width
}

function lineStyle(index = 0) {
  return {
    top: `${NATIVE_PRIMARY_LAYOUT.paddingTop + index * NATIVE_PRIMARY_LAYOUT.lineHeight}px`,
    height: `${NATIVE_PRIMARY_LAYOUT.lineHeight}px`,
  }
}

function selectionBlockStyle(block = {}) {
  return {
    left: `${block.left}px`,
    top: `${block.top}px`,
    width: `${block.width}px`,
    height: `${block.height}px`,
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

  return clampNativePrimaryOffset(normalized, index + targetColumn - 1)
}

function focusInputBridge() {
  textareaRef.value?.focus?.()
}

function syncSelectionStateFromBridge() {
  const textarea = textareaRef.value
  if (!textarea) return selectionState.value
  selectionAnchor.value = clampNativePrimaryOffset(draftText.value, textarea.selectionStart ?? 0)
  selectionHead.value = clampNativePrimaryOffset(draftText.value, textarea.selectionEnd ?? 0)
  return selectionState.value
}

function setBridgeSelection(anchor, head = anchor, options = {}) {
  const textarea = textareaRef.value
  const safeAnchor = clampNativePrimaryOffset(draftText.value, anchor)
  const safeHead = clampNativePrimaryOffset(draftText.value, head)
  selectionAnchor.value = safeAnchor
  selectionHead.value = safeHead
  if (textarea) {
    if (options.focus !== false) {
      textarea.focus()
    }
    textarea.setSelectionRange(safeAnchor, safeHead)
  }
  if (options.ensureVisible !== false) {
    ensureCaretVisible()
  }
  return buildNativePrimarySelectionPayload({
    filePath: props.filePath,
    text: draftText.value,
    anchor: safeAnchor,
    head: safeHead,
  })
}

function deriveSelectionPayload() {
  return selectionState.value
}

function paletteAnchorPosition() {
  const scrollerRect = scrollerRef.value?.getBoundingClientRect?.()
  if (scrollerRect && caretVisual.value) {
    return {
      x: Math.round(scrollerRect.left + caretVisual.value.left - scrollLeft.value + 12),
      y: Math.round(scrollerRect.top + caretVisual.value.top - scrollTop.value + NATIVE_PRIMARY_LAYOUT.lineHeight),
    }
  }

  const rect = containerRef.value?.getBoundingClientRect?.()
  return {
    x: Math.round((rect?.left || 0) + 48),
    y: Math.round((rect?.top || 0) + 72),
  }
}

function emitEditorStats() {
  const stats = buildNativePrimaryEditorStats(draftText.value, deriveSelectionPayload())
  emit('editor-stats', {
    words: stats.words,
    chars: stats.chars,
    selWords: stats.selWords,
    selChars: stats.selChars,
  })
  emitEditorRuntimeTelemetry({
    type: 'editor-stats',
    runtimeKind: 'native-primary',
    paneId: props.paneId,
    filePath: props.filePath,
    words: stats.words,
    chars: stats.chars,
    selectedWords: stats.selWords,
    selectedChars: stats.selChars,
  })
}

async function syncSelectionToNativeRuntime(payload = null) {
  const selection = payload || deriveSelectionPayload()
  if (!selection) return false
  const cursor = buildNativePrimaryCursorSnapshot(draftText.value, selection)
  emit('selection-change', selection)
  emit('cursor-change', {
    offset: cursor.offset,
    line: cursor.line,
    column: cursor.column,
  })
  emitEditorRuntimeTelemetry({
    type: 'selection-change',
    runtimeKind: 'native-primary',
    paneId: props.paneId,
    ...selection,
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

function clearAutoSaveTimer() {
  if (autoSaveTimer != null && typeof window !== 'undefined') {
    window.clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
}

function ensureCaretVisible() {
  const scroller = scrollerRef.value
  if (!scroller || !caretVisual.value) return false
  const caretTop = caretVisual.value.top
  const caretBottom = caretTop + caretVisual.value.height
  const caretLeft = caretVisual.value.left
  const caretRight = caretLeft + NATIVE_PRIMARY_LAYOUT.caretWidth

  if (caretTop < scroller.scrollTop) {
    scroller.scrollTop = Math.max(0, caretTop - NATIVE_PRIMARY_LAYOUT.lineHeight)
  } else if (caretBottom > scroller.scrollTop + scroller.clientHeight) {
    scroller.scrollTop = caretBottom - scroller.clientHeight + NATIVE_PRIMARY_LAYOUT.lineHeight
  }

  if (caretLeft < scroller.scrollLeft) {
    scroller.scrollLeft = Math.max(0, caretLeft - NATIVE_PRIMARY_LAYOUT.paddingLeft)
  } else if (caretRight > scroller.scrollLeft + scroller.clientWidth) {
    scroller.scrollLeft = caretRight - scroller.clientWidth + NATIVE_PRIMARY_LAYOUT.paddingRight
  }

  scrollTop.value = Number(scroller.scrollTop || 0)
  scrollLeft.value = Number(scroller.scrollLeft || 0)
  return true
}

function handleScroll(event) {
  const target = event?.target
  scrollTop.value = Number(target?.scrollTop || 0)
  scrollLeft.value = Number(target?.scrollLeft || 0)
}

function pointToOffset(event) {
  const rect = scrollerRef.value?.getBoundingClientRect?.()
  if (!rect) return 0
  return resolveNativePrimaryOffsetAtPoint({
    text: draftText.value,
    lineNumbers: lineNumbers.value,
    x: Number(event.clientX || 0) - rect.left + scrollLeft.value,
    y: Number(event.clientY || 0) - rect.top + scrollTop.value,
    layout: NATIVE_PRIMARY_LAYOUT,
    measureTextWidth,
  })
}

function handleSurfaceMouseDown(event) {
  if (event.button !== 0) return
  event.preventDefault()
  const offset = pointToOffset(event)
  pointerSelectionMoved = false
  pointerSelecting = true
  pointerAnchorOffset = event.shiftKey ? selectionAnchor.value : offset
  setBridgeSelection(pointerAnchorOffset, offset)
  scheduleSelectionSync()
  attachPointerSelectionListeners()
}

function handlePointerMove(event) {
  if (!pointerSelecting) return
  pointerSelectionMoved = true
  const offset = pointToOffset(event)
  setBridgeSelection(pointerAnchorOffset ?? offset, offset)
  scheduleSelectionSync()
}

function handlePointerUp() {
  if (!pointerSelecting) return
  pointerSelecting = false
  detachPointerSelectionListeners()
  ensureCaretVisible()
  dispatchMarkdownForwardSync('selection-sync')
}

function attachPointerSelectionListeners() {
  if (typeof window === 'undefined') return
  window.addEventListener('mousemove', handlePointerMove)
  window.addEventListener('mouseup', handlePointerUp)
}

function detachPointerSelectionListeners() {
  if (typeof window === 'undefined') return
  window.removeEventListener('mousemove', handlePointerMove)
  window.removeEventListener('mouseup', handlePointerUp)
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
  if (!hasActiveMarkdownPreviewTarget()) return false
  const request = buildNativePrimaryMarkdownForwardSyncRequest({
    isMarkdownFile,
    selection: deriveSelectionPayload(),
    text: draftText.value,
    filePath: props.filePath,
    source,
  })
  if (!request) return false
  rememberPendingMarkdownForwardSync({
    sourcePath: request.sourcePath,
    line: request.line,
    offset: request.offset,
  })
  window.dispatchEvent(
    new CustomEvent('markdown-forward-sync-location', {
      detail: {
        sourcePath: request.sourcePath,
        line: request.line,
        offset: request.offset,
      },
    })
  )
  emitEditorRuntimeTelemetry({
    type: 'markdown-forward-sync-request',
    runtimeKind: 'native-primary',
    paneId: props.paneId,
    filePath: props.filePath,
    line: request.line,
    offset: request.offset,
    source: request.source,
  })
  void editorRuntimeStore.recordNativeWorkflowEvent({
    path: props.filePath,
    event: {
      kind: 'markdown-forward-sync-request',
      line: request.line,
      offset: request.offset,
      source: request.source,
    },
  })
  return true
}

function triggerLatexForwardSync(source = 'cursor-request') {
  if (!hasActiveLatexPdfPreviewTarget()) return false
  const request = buildNativePrimaryLatexForwardSyncRequest({
    isLatexFile,
    selection: deriveSelectionPayload(),
    text: draftText.value,
    filePath: props.filePath,
    source,
  })
  if (!request) return false
  emitEditorRuntimeTelemetry({
    type: 'latex-forward-sync-request',
    runtimeKind: 'native-primary',
    paneId: props.paneId,
    filePath: props.filePath,
    line: request.line,
    column: request.column,
    source: request.source,
  })
  void editorRuntimeStore.recordNativeWorkflowEvent({
    path: props.filePath,
    event: {
      kind: 'latex-forward-sync-request',
      line: request.line,
      column: request.column,
      source: request.source,
    },
  })
  latexStore.requestForwardSync(props.filePath, request.line, request.column)
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

function applyCitationTrigger(trigger = null) {
  return applyNativeCitationTriggerState(citPalette, paletteAnchorPosition(), trigger)
}

function applyCitationEditContext(context = null) {
  const selection = deriveSelectionPayload()
  return applyNativeCitationEditState(
    citPalette,
    paletteAnchorPosition(),
    context,
    selection?.hasSelection === true
  )
}

async function inspectCurrentNativeContext() {
  const selection = deriveSelectionPayload()
  return inspectNativePrimaryInteractionContext({
    editorRuntimeStore,
    path: props.filePath,
    text: draftText.value,
    selection: selection
      ? {
          anchor: selection.anchor,
          head: selection.head,
        }
      : null,
  })
}

async function refreshCitationPaletteFromNative() {
  const context = await inspectCurrentNativeContext()
  return applyCitationTrigger(context?.citationTrigger || null)
}

async function planCitationReplacement({
  operation = '',
  keys = [],
  cites = [],
  latexCommand = null,
} = {}) {
  return planNativePrimaryCitationReplacement({
    editorRuntimeStore,
    path: props.filePath,
    citPalette,
    operation,
    keys,
    cites,
    latexCommand,
  })
}

async function planFileDropInsertion(paths = []) {
  return editorRuntimeStore.planNativeFileDropInsertion({
    sourcePath: props.filePath,
    droppedPaths: Array.isArray(paths) ? paths : [],
  })
}

async function maybeHandleWikiLinkClick(event, context = null) {
  if (!isMarkdownFile) return false
  return resolveNativeWikiLinkInteraction({
    context,
    filePath: props.filePath,
    linksStore,
    editorStore,
    files,
    event,
    recordWorkflowEvent: (workflowEvent) =>
      editorRuntimeStore.recordNativeWorkflowEvent({
        path: props.filePath,
        event: workflowEvent,
      }),
  })
}

async function persistNativePrimaryContent(content = draftText.value) {
  const result = await persistNativePrimaryDocument({
    text: content,
    filePath: props.filePath,
    fileKind: fileKind.value,
    isDraftFile,
    files,
    editorStore,
    editorRuntimeStore,
  })
  if (!result?.persisted) return false
  lastPersistedContent = result.text
  return true
}

async function handleInput() {
  if (suppressInputSync) return
  syncSelectionStateFromBridge()
  const result = await applyNativePrimaryInputChange({
    text: draftText.value,
    filePath: props.filePath,
    fileKind: fileKind.value,
    paneId: props.paneId,
    lastPersistedContent,
    files,
    editorStore,
    editorRuntimeStore,
  })
  if (!result) return
  emitEditorStats()
  ensureCaretVisible()
  scheduleSelectionSync()
  dispatchMarkdownForwardSync('selection-sync')
  scheduleAutoSave()
  void refreshCitationPaletteFromNative()
}

function handleBridgeSelectionChange() {
  syncSelectionStateFromBridge()
  ensureCaretVisible()
  scheduleSelectionSync()
  dispatchMarkdownForwardSync('selection-sync')
}

function handleBridgeFocus() {
  isInputFocused.value = true
}

function handleBridgeBlur() {
  isInputFocused.value = false
}

function handleCompositionStart() {
  isComposing.value = true
}

function handleCompositionEnd() {
  isComposing.value = false
}

async function handleSurfaceClick(event) {
  if (pointerSelectionMoved) {
    pointerSelectionMoved = false
    return
  }
  const context = await inspectCurrentNativeContext()
  await handleNativePrimaryClickInteraction({
    event,
    context,
    isMarkdownFile,
    resolveWikiLinkInteraction: maybeHandleWikiLinkClick,
    applyCitationEditContext,
    applyCitationTrigger,
  })
}

function handleSurfaceDoubleClick(event) {
  event.preventDefault()
  if (isLatexFile) {
    triggerLatexForwardSync('double-click')
    return
  }
  const offset = pointToOffset(event)
  const range = selectNativePrimaryWord(draftText.value, offset)
  setBridgeSelection(range.anchor, range.head)
  scheduleSelectionSync()
}

function applyDraftEdits(text = '', edits = []) {
  const sortedEdits = Array.isArray(edits)
    ? [...edits].sort((left, right) => Number(right?.start || 0) - Number(left?.start || 0))
    : []
  let nextText = String(text || '')
  for (const edit of sortedEdits) {
    const safeStart = clampNativePrimaryOffset(nextText, edit?.start ?? 0)
    const safeEnd = clampNativePrimaryOffset(nextText, edit?.end ?? safeStart)
    nextText = `${nextText.slice(0, safeStart)}${String(edit?.text || '')}${nextText.slice(safeEnd)}`
  }
  return nextText
}

async function applyCharacterInputPlan(plan = null) {
  if (!plan?.handled) return false
  const nextText =
    Array.isArray(plan?.edits) && plan.edits.length > 0
      ? applyDraftEdits(draftText.value, plan.edits)
      : draftText.value
  const primarySelection = Array.isArray(plan?.selections) ? plan.selections[0] || null : null

  suppressInputSync = true
  draftText.value = nextText
  files.setInMemoryFileContent(props.filePath, nextText)
  suppressInputSync = false

  await nextTick()

  if (primarySelection) {
    setBridgeSelection(primarySelection.anchor, primarySelection.head)
  }

  if (nextText !== String(lastPersistedContent || '')) {
    editorStore.markFileDirty(props.filePath)
  } else {
    editorStore.clearFileDirty(props.filePath)
  }

  if (Array.isArray(plan?.edits) && plan.edits.length > 0) {
    editorRuntimeStore.beginTypingLatencyProbe({
      path: props.filePath,
      text: nextText,
      fileKind: fileKind.value,
    })
    await editorRuntimeStore.applyNativeTransaction({
      path: props.filePath,
      edits: plan.edits,
    })
  }

  emitEditorStats()
  ensureCaretVisible()
  scheduleSelectionSync()
  dispatchMarkdownForwardSync('selection-sync')
  scheduleAutoSave()
  void refreshCitationPaletteFromNative()
  return true
}

function shouldHandleAutoPairInput(event) {
  if (!isMarkdownFile) return false
  if (isComposing.value || event.isComposing) return false
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  if (typeof event.key !== 'string' || event.key.length !== 1) return false
  return AUTO_PAIR_INPUTS.has(event.key)
}

async function handleKeydown(event) {
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '')
  const modKey = isMac ? event.metaKey : event.ctrlKey
  if (modKey && String(event.key || '').toLowerCase() === 's') {
    event.preventDefault()
    void persistNativePrimaryContent(draftText.value)
    return
  }
  if (!shouldHandleAutoPairInput(event)) return
  event.preventDefault()
  const plan = await editorRuntimeStore.planNativeCharacterInput({
    path: props.filePath,
    input: event.key,
    selection: deriveSelectionPayload(),
  })
  if (!plan) return
  await applyCharacterInputPlan(plan)
}

function applyExternalContent(nextContent = '') {
  const text = String(nextContent || '')
  suppressInputSync = true
  draftText.value = text
  files.setInMemoryFileContent(props.filePath, text)
  suppressInputSync = false
  setBridgeSelection(
    Math.min(selectionAnchor.value, text.length),
    Math.min(selectionHead.value, text.length),
    { focus: false }
  )
  return editorRuntimeStore.replaceNativeDocumentText({
    path: props.filePath,
    text,
  })
}

async function onCitInsert({ keys = [], stayOpen = false, latexCommand = null }) {
  if (keys.length === 0) return
  const plan = await planCitationReplacement({
    operation: 'insert',
    keys,
    latexCommand,
  })
  if (!plan) return
  setBridgeSelection(plan.from, plan.to)
  await applyCharacterInputPlan({
    handled: true,
    edits: [
      {
        start: plan.from,
        end: plan.to,
        text: plan.text,
      },
    ],
    selections: [
      {
        anchor: plan.from + String(plan.text || '').length,
        head: plan.from + String(plan.text || '').length,
      },
    ],
  })

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
    void inspectCurrentNativeContext().then((context) => {
      applyCitationEditContext(context)
    })
    return
  }
  citPalette.show = false
}

async function onCitUpdate({ cites = [] }) {
  const normalizedCites = normalizeNativeCitationEntries(cites)
  const plan = await planCitationReplacement({
    operation: 'update',
    cites: normalizedCites,
  })
  if (!plan) return
  setBridgeSelection(plan.from, plan.to)
  await applyCharacterInputPlan({
    handled: true,
    edits: [
      {
        start: plan.from,
        end: plan.to,
        text: plan.text,
      },
    ],
    selections: [
      {
        anchor: plan.from + String(plan.text || '').length,
        head: plan.from + String(plan.text || '').length,
      },
    ],
  })
  citPalette.groupFrom = plan.from
  citPalette.groupTo = plan.from + String(plan.text || '').length
  void editorRuntimeStore.recordNativeWorkflowEvent({
    path: props.filePath,
    event: {
      kind: 'citation-update',
      mode: isLatexFile ? 'latex' : 'markdown',
      keys: normalizedCites.map((cite) => cite.key),
      latexCommand: citPalette.latexCommand || null,
    },
  })
  if (!isLatexFile && normalizedCites.length === 0) {
    citPalette.show = false
  }
}

function onCitClose() {
  citPalette.show = false
  focusInputBridge()
}

function revealRange(from, to = from, options = {}) {
  const selection = setBridgeSelection(from, to, { focus: options.focus !== false })
  if (options.focus === false) {
    textareaRef.value?.blur?.()
  }
  void editorRuntimeStore.recordNativeWorkflowEvent({
    path: props.filePath,
    event: {
      kind: 'reveal-range',
      from: selection.from,
      to: selection.to,
      source: 'native-primary',
    },
  })
  ensureCaretVisible()
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
      focus: focusInputBridge,
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
        await revealLatexSourceLocation(
          editorStore,
          {
            ...detail,
            filePath: targetFile,
          },
          {
            paneId: props.paneId,
            center: true,
          }
        )
        return
      }
      const offset = lineColumnToOffset(draftText.value, detail.line, detail.column)
      revealRange(offset, offset, { focus: true })
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

  if (!fileTreeDragStartHandler) {
    fileTreeDragStartHandler = (event) => {
      draggedFilePaths = Array.isArray(event.detail?.paths)
        ? event.detail.paths.map((path) => String(path || '')).filter(Boolean)
        : []
    }
    window.addEventListener('filetree-drag-start', fileTreeDragStartHandler)
  }

  if (!fileTreeDragEndHandler) {
    fileTreeDragEndHandler = async (event) => {
      const paths = Array.isArray(event.detail?.paths)
        ? event.detail.paths.map((path) => String(path || '')).filter(Boolean)
        : draggedFilePaths
      draggedFilePaths = []
      if (paths.length === 0) return

      const x = Number(event.detail?.x)
      const y = Number(event.detail?.y)
      const rect = containerRef.value?.getBoundingClientRect?.()
      const droppedInside =
        rect &&
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      if (!droppedInside) return

      const selection = deriveSelectionPayload()
      if (!selection) return
      const plan = await planFileDropInsertion(paths)
      if (!plan?.text) return

      setBridgeSelection(selection.head, selection.head)
      await applyCharacterInputPlan({
        handled: true,
        edits: [
          {
            start: selection.head,
            end: selection.head,
            text: plan.text,
          },
        ],
        selections: [
          {
            anchor: selection.head + String(plan.text || '').length,
            head: selection.head + String(plan.text || '').length,
          },
        ],
      })
      void editorRuntimeStore.recordNativeWorkflowEvent({
        path: props.filePath,
        event: {
          kind: 'file-drop-insert',
          count: paths.length,
          fileKind: fileKind.value,
        },
      })
    }
    window.addEventListener('filetree-drag-end', fileTreeDragEndHandler)
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
  if (fileTreeDragStartHandler) {
    window.removeEventListener('filetree-drag-start', fileTreeDragStartHandler)
    fileTreeDragStartHandler = null
  }
  if (fileTreeDragEndHandler) {
    window.removeEventListener('filetree-drag-end', fileTreeDragEndHandler)
    fileTreeDragEndHandler = null
  }
  draggedFilePaths = []
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
    setBridgeSelection(
      Math.min(selectionAnchor.value, text.length),
      Math.min(selectionHead.value, text.length),
      { focus: false, ensureVisible: false }
    )
    emitEditorStats()
  },
  { immediate: true }
)

watch(
  () => nativeDocument.value?.selections?.[0] || null,
  (selection) => {
    if (!selection || pointerSelecting || !nativeSnapshotFresh.value) return
    const nextAnchor = clampNativePrimaryOffset(draftText.value, selection.anchor ?? 0)
    const nextHead = clampNativePrimaryOffset(draftText.value, selection.head ?? 0)
    if (nextAnchor === selectionAnchor.value && nextHead === selectionHead.value) return
    setBridgeSelection(nextAnchor, nextHead, {
      focus: false,
      ensureVisible: false,
    })
  },
  { deep: true }
)

watch(
  cursorState,
  (cursor) => {
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
  selectionAnchor.value = 0
  selectionHead.value = 0
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
  resetTextMeasureContext()
  setBridgeSelection(0, 0, { focus: false, ensureVisible: false })
})

onUnmounted(() => {
  if (selectionSyncFrame != null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(selectionSyncFrame)
    selectionSyncFrame = null
  }
  clearAutoSaveTimer()
  detachPointerSelectionListeners()
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
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--shell-editor-surface);
}

.native-primary-text-chrome {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.native-primary-gutter {
  position: relative;
  overflow: hidden;
  border-right: 1px solid color-mix(in srgb, var(--border) 36%, transparent);
  background: color-mix(in srgb, var(--shell-editor-surface) 94%, var(--surface-muted) 6%);
}

.native-primary-gutter-scroll {
  padding: 28px 12px 48px 16px;
  will-change: transform;
}

.native-primary-gutter-line {
  height: 23.8px;
  color: color-mix(in srgb, var(--text-secondary) 74%, transparent);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 23.8px;
  text-align: right;
}

.native-primary-gutter-line.is-active {
  color: color-mix(in srgb, var(--accent) 80%, var(--text-primary) 20%);
}

.native-primary-editor-scroller {
  position: relative;
  overflow: auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--shell-editor-surface);
  cursor: text;
}

.native-primary-editor-canvas {
  position: relative;
  min-height: 100%;
  isolation: isolate;
}

.native-primary-selection-layer,
.native-primary-line-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.native-primary-selection-block {
  position: absolute;
  background: var(--editor-selection);
  border-radius: 4px;
}

.native-primary-line {
  position: absolute;
  left: 0;
  right: 0;
  padding: 0 32px;
  font-family: var(--font-mono);
  font-size: var(--editor-font-size);
  line-height: 23.8px;
  white-space: pre;
}

.native-primary-line.is-active {
  background: var(--editor-active-line);
}

.native-primary-segment {
  color: var(--text-primary);
}

.native-primary-segment--heading {
  color: var(--hl-heading);
  font-weight: 600;
}

.native-primary-segment--emphasis {
  color: var(--hl-emphasis);
  font-style: italic;
}

.native-primary-segment--strong {
  color: var(--hl-heading-minor);
  font-weight: 700;
}

.native-primary-segment--code,
.native-primary-segment--code-fence {
  color: var(--hl-code);
}

.native-primary-segment--list-marker,
.native-primary-segment--blockquote-marker {
  color: var(--hl-list);
}

.native-primary-segment--link,
.native-primary-segment--image {
  color: var(--hl-link);
}

.native-primary-segment--math {
  color: var(--hl-operator);
}

.native-primary-segment--delimiter-match {
  background: var(--editor-bracket-match);
  box-shadow: inset 0 0 0 1px var(--editor-bracket-border);
  border-radius: 3px;
}

.native-primary-caret {
  position: absolute;
  width: 2px;
  background: var(--text-primary);
  border-radius: 999px;
  pointer-events: none;
  z-index: 3;
}

.native-primary-input-bridge {
  position: absolute;
  width: 1px;
  min-width: 1px;
  max-width: 1px;
  min-height: 23.8px;
  resize: none;
  overflow: hidden;
  border: 0;
  outline: none;
  padding: 0;
  margin: 0;
  background: transparent;
  color: transparent;
  caret-color: transparent;
  -webkit-text-fill-color: transparent;
  -webkit-text-stroke-color: transparent;
  opacity: 0;
  pointer-events: none;
}
</style>
