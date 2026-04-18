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
import {
  applyNativePrimaryInputChange,
  applyNativeCitationEditState,
  applyNativeCitationTriggerState,
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
  })
  emitEditorRuntimeTelemetry({
    type: 'selection-change',
    runtimeKind: 'native-primary',
    paneId: props.paneId,
    ...selection,
  })
  emit('cursor-change', {
    offset: cursor.offset,
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
  scheduleSelectionSync()
  dispatchMarkdownForwardSync('selection-sync')
  scheduleAutoSave()
  void refreshCitationPaletteFromNative()
}

function handleSelectionChange() {
  scheduleSelectionSync()
  dispatchMarkdownForwardSync('selection-sync')
}

async function handleClick(event) {
  handleSelectionChange()
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

async function onCitInsert({ keys = [], stayOpen = false, latexCommand = null }) {
  if (keys.length === 0) return
  const plan = await planCitationReplacement({
    operation: 'insert',
    keys,
    latexCommand,
  })
  if (!plan) return
  replaceTextRange(plan.from, plan.to, plan.text)

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
  replaceTextRange(plan.from, plan.to, plan.text)
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
