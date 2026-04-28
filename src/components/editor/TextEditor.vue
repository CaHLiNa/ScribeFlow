<template>
  <div
    class="text-editor-shell h-full w-full"
    :class="{ 'cm-prose-file': isMd, 'cm-latex-file': isLatexEditor }"
    :data-editor-filepath="props.filePath"
  >
    <div
      v-if="loadError"
      class="text-editor-load-error flex h-full items-center justify-center px-6 text-sm"
    >
      <div class="max-w-lg text-center space-y-2">
        <div>{{ loadError.message }}</div>
        <div v-if="loadError.detail" class="text-xs">{{ loadError.detail }}</div>
      </div>
    </div>
    <div
      v-else
      ref="editorContainer"
      class="text-editor-host min-h-0 flex-1 w-full overflow-hidden"
      @contextmenu.prevent="onContextMenu"
    ></div>
  </div>
  <EditorContextMenu
    :visible="ctxMenu.show"
    :x="ctxMenu.x"
    :y="ctxMenu.y"
    :has-selection="ctxMenu.hasSelection"
    :view="view"
    :show-format-document="isLatexEditor"
    :show-insert-citation="isMd || isLatexEditor"
    :show-markdown-insert-table="isMd"
    :show-markdown-format-table="ctxMenu.showMarkdownFormatTable"
    @close="closeContextMenu"
    @format-document="handleFormatDocument"
    @insert-citation="handleInsertCitation"
    @insert-markdown-table="handleInsertMarkdownTable"
    @format-markdown-table="handleFormatMarkdownTable"
    @paste-unavailable="handleContextMenuPasteUnavailable"
  />
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
</template>

<script setup>
import {
  ref,
  reactive,
  computed,
  onMounted,
  onUnmounted,
  onActivated,
  onDeactivated,
  watch,
} from 'vue'
import { Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { hoverTooltip } from '@codemirror/view'
import {
  createEditorExtensions,
  createEditorState,
  columnWidthCompartment,
  columnWidthExtension,
  editorInputAttributesCompartment,
  editorInputAttributesExtension,
  lineNumbersCompartment,
  lineNumbersExtension,
  activeLineCompartment,
  activeLineExtension,
} from '../../editor/setup'
import { createRevealHighlightExtension } from '../../editor/revealHighlight'
import {
  captureContextMenuState,
  normalizeContextMenuClickPos,
  resolveContextMenuSelection,
} from '../../editor/contextMenuPolicy'
import { wikiLinksExtension } from '../../editor/wikiLinks'
import { citationsExtension, CITATION_GROUP_RE } from '../../editor/citations'
import { latexCitationsExtension, LATEX_CITE_RE } from '../../editor/latexCitations'
import { createMarkdownDraftSnippetSource } from '../../editor/markdownSnippets'
import {
  formatCurrentMarkdownTable,
  hasMarkdownTableAtCursor,
  insertMarkdownTable,
} from '../../editor/markdownTables'
import { useFilesStore } from '../../stores/files'
import { useEditorStore } from '../../stores/editor'
import { useToastStore } from '../../stores/toast'
import { useWorkspaceStore } from '../../stores/workspace'
import { useLinksStore } from '../../stores/links'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useLatexStore } from '../../stores/latex'
import { useReferencesStore } from '../../stores/references'
import { isDraftPath, isMarkdown, isLatex, isLatexEditorFile } from '../../utils/fileTypes'
import {
  getCachedLatexProjectGraph,
  resolveLatexProjectGraph,
} from '../../services/latex/projectGraph'
import { revealLatexSourceLocation } from '../../services/latex/previewSync.js'
import {
  MARKDOWN_BACKWARD_SYNC_EVENT,
  dispatchMarkdownForwardSync,
  rememberPendingMarkdownForwardSync,
} from '../../services/markdown/previewSync.js'
import {
  LATEX_BACKWARD_SYNC_EVENT,
  dispatchLatexForwardSync,
} from '../../services/latex/pdfPreviewSync.js'
import { basenamePath, dirnamePath } from '../../utils/path'
import { createFoldingExtension } from '../../editor/foldingRuntime'
import EditorContextMenu from './EditorContextMenu.vue'
import CitationPalette from './CitationPalette.vue'
import { useTextEditorBridges } from '../../composables/useTextEditorBridges'
import { useI18n } from '../../i18n'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
})

const emit = defineEmits(['cursor-change', 'editor-stats', 'selection-change'])

const editorContainer = ref(null)
const files = useFilesStore()
const editorStore = useEditorStore()
const workspace = useWorkspaceStore()
const workflowStore = useDocumentWorkflowStore()
const linksStore = useLinksStore()
const toastStore = useToastStore()
const latexStore = useLatexStore()
const referencesStore = useReferencesStore()
const { t } = useI18n()
const loadError = computed(() => files.getFileLoadError(props.filePath))

let view = null
let backwardSyncHandler = null
let latexSourceDoubleClickHandler = null
let markdownCursorRequestHandler = null
let markdownBackwardSyncHandler = null
let markdownPreviewSyncTimer = null
let markdownPreviewScrollSyncFrame = null
let editorRuntimeActive = false
let pendingContextMenuState = null
let contextMenuRestoreFrame = null
let contextMenuRestoreTimeout = null
let latexNormalizedSaveContent = null
let latexFormatOnSaveInFlight = false
let latexWarmupHandle = null
let lastPersistedContent = ''
let suppressMarkdownPreviewScrollSyncUntil = 0

const isDraftFile = isDraftPath(props.filePath)
const isMd = isMarkdown(props.filePath)
const isTex = isLatex(props.filePath)
const isLatexEditor = isLatexEditorFile(props.filePath)
const runtimeFilePath = isDraftFile ? '' : props.filePath
const supportsLatexRuntime = !isDraftFile && isTex
const isMacPlatform =
  typeof navigator !== 'undefined' &&
  /mac/i.test(navigator.userAgentData?.platform || navigator.platform || '')

const ctxMenu = reactive({
  show: false,
  x: 0,
  y: 0,
  hasSelection: false,
  showMarkdownFormatTable: false,
  requestId: 0,
})

const citPalette = reactive({
  show: false,
  mode: 'insert',
  x: 0,
  y: 0,
  query: '',
  cites:[],
  latexCommand: null,
  triggerFrom: 0,
  triggerTo: 0,
  insideBrackets: false,
  groupFrom: 0,
  groupTo: 0,
})

const getView = () => view

const { showMergeViewIfNeeded } = useTextEditorBridges({
  filePath: runtimeFilePath,
  editorContainer,
  getView,
  files,
  isMarkdownFile: isMd,
  isLatexFile: supportsLatexRuntime,
})

function isContextMenuMouseGesture(event) {
  return event.button === 2 || (isMacPlatform && event.button === 0 && event.ctrlKey)
}

function clearContextMenuRestoreHandles() {
  if (contextMenuRestoreFrame !== null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(contextMenuRestoreFrame)
    contextMenuRestoreFrame = null
  }
  if (contextMenuRestoreTimeout !== null && typeof window !== 'undefined') {
    window.clearTimeout(contextMenuRestoreTimeout)
    contextMenuRestoreTimeout = null
  }
}

function restoreContextMenuSelection(selection) {
  if (!view || !selection || selection.eq(view.state.selection)) return
  view.dispatch({ selection })
}

function scheduleContextMenuSelectionRestore(selection) {
  clearContextMenuRestoreHandles()
  if (!selection || typeof window === 'undefined') return

  contextMenuRestoreFrame = window.requestAnimationFrame(() => {
    contextMenuRestoreFrame = null
    restoreContextMenuSelection(selection)
    contextMenuRestoreTimeout = window.setTimeout(() => {
      contextMenuRestoreTimeout = null
      restoreContextMenuSelection(selection)
    }, 0)
  })
}

function resolveContextMenuClickPos(event) {
  if (!view) return null

  const coords = { x: event.clientX, y: event.clientY }
  const approxPos = view.posAtCoords(coords, false)
  if (approxPos === null) return null

  const block = view.lineBlockAtHeight(coords.y - view.documentTop)
  return normalizeContextMenuClickPos(approxPos, block)
}

function handleContextMenuMouseDown(event) {
  if (!view) {
    pendingContextMenuState = null
    return
  }

  if (!isContextMenuMouseGesture(event)) {
    pendingContextMenuState = null
    return
  }

  pendingContextMenuState = captureContextMenuState(view.state, resolveContextMenuClickPos(event))
  event.preventDefault()
  event.stopPropagation()
}

function onContextMenu(event) {
  ctxMenu.x = event.clientX
  ctxMenu.y = event.clientY

  if (view) {
    view.focus()
    const decision = resolveContextMenuSelection(
      pendingContextMenuState ||
        captureContextMenuState(view.state, resolveContextMenuClickPos(event))
    )
    if (decision.nextSelection && !decision.nextSelection.eq(view.state.selection)) {
      view.dispatch({ selection: decision.nextSelection })
    }
    scheduleContextMenuSelectionRestore(decision.nextSelection)
    ctxMenu.hasSelection = decision.hasSelection
  } else {
    ctxMenu.hasSelection = false
    clearContextMenuRestoreHandles()
  }

  pendingContextMenuState = null
  ctxMenu.show = true
  ctxMenu.showMarkdownFormatTable = !!(isMd && view && hasMarkdownTableAtCursor(view.state))
  ctxMenu.requestId += 1
}

function closeContextMenu() {
  ctxMenu.show = false
  ctxMenu.showMarkdownFormatTable = false
  ctxMenu.requestId += 1
}

function handleContextMenuPasteUnavailable() {
  toastStore.show(
    t('Paste from the context menu is unavailable here. Use {shortcut} instead.', {
      shortcut: isMacPlatform ? '⌘V' : 'Ctrl+V',
    }),
    {
      type: 'info',
      duration: 2600,
    }
  )
}

function clearLatexWarmupHandle() {
  if (latexWarmupHandle == null || typeof window === 'undefined') return
  if (typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(latexWarmupHandle)
  } else {
    window.clearTimeout(latexWarmupHandle)
  }
  latexWarmupHandle = null
}

function scheduleLatexWarmup(content = '') {
  if (!supportsLatexRuntime || typeof window === 'undefined') return
  clearLatexWarmupHandle()

  const runWarmup = async () => {
    latexWarmupHandle = null
    try {
      await latexStore.checkTools()
      await Promise.allSettled([
        latexStore.refreshLint(props.filePath, {
          sourceContent: content,
        }),
        getCachedLatexProjectGraph(props.filePath)
          ? Promise.resolve()
          : resolveLatexProjectGraph(props.filePath, {
              filesStore: files,
              workspacePath: workspace.path,
            }),
      ])
    } catch {
      // Warmup failures should not block editor startup.
    }
  }

  if (typeof window.requestIdleCallback === 'function') {
    latexWarmupHandle = window.requestIdleCallback(
      () => {
        void runWarmup()
      },
      { timeout: 400 }
    )
    return
  }

  latexWarmupHandle = window.setTimeout(() => {
    void runWarmup()
  }, 120)
}

const DISPLAY_MATH_ENVIRONMENT_NAMES = new Set([
  'displaymath',
  'equation',
  'equation*',
  'align',
  'align*',
  'aligned',
  'alignedat',
  'alignat',
  'alignat*',
  'gather',
  'gather*',
  'gathered',
  'multline',
  'multline*',
  'flalign',
  'flalign*',
  'eqnarray',
  'eqnarray*',
  'split',
  'math',
])

function stripLatexLineComment(line = '') {
  let escaped = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '%' && !escaped) {
      return line.slice(0, index)
    }
    escaped = char === '\\' ? !escaped : false
  }
  return line
}

function parseLatexDisplayMathBoundary(lineText = '') {
  const content = stripLatexLineComment(lineText).trim()
  if (!content) return null

  const environmentMatch = content.match(/^\\(begin|end)\{([^}]+)\}$/)
  if (environmentMatch) {
    const type = environmentMatch[1]
    const environmentName = environmentMatch[2]
    if (DISPLAY_MATH_ENVIRONMENT_NAMES.has(environmentName)) {
      return {
        kind: 'environment',
        type,
        token: environmentName,
      }
    }
  }

  if (content === '\\[') {
    return { kind: 'delimiter', type: 'begin', token: '\\[' }
  }
  if (content === '\\]') {
    return { kind: 'delimiter', type: 'end', token: '\\[' }
  }
  if (content === '$$') {
    return { kind: 'delimiter', type: 'toggle', token: '$$' }
  }

  return null
}

function isIgnorableLatexForwardSyncLine(lineText = '') {
  const content = stripLatexLineComment(lineText).trim()
  if (!content) return true
  if (parseLatexDisplayMathBoundary(content)) return true
  return /^\\(?:label|tag|notag|nonumber|intertext|shortintertext)\b/.test(content)
}

function firstMeaningfulColumn(lineText = '') {
  const searchText = stripLatexLineComment(String(lineText || ''))
  const match = searchText.match(/\S/)
  return match ? match.index + 1 : 1
}

function resolveLatexForwardSyncTarget(viewInstance, pos = 0) {
  if (!viewInstance?.state?.doc) return null

  const document = viewInstance.state.doc
  const currentLine = document.lineAt(pos)
  const boundary = parseLatexDisplayMathBoundary(currentLine.text)

  if (boundary?.kind === 'environment' && boundary.type === 'begin') {
    let depth = 0
    for (let lineNumber = currentLine.number + 1; lineNumber <= document.lines; lineNumber += 1) {
      const line = document.line(lineNumber)
      const lineBoundary = parseLatexDisplayMathBoundary(line.text)
      if (lineBoundary?.kind === 'environment' && lineBoundary.token === boundary.token) {
        if (lineBoundary.type === 'begin') {
          depth += 1
          continue
        }
        if (lineBoundary.type === 'end') {
          if (depth === 0) break
          depth -= 1
          continue
        }
      }
      if (depth === 0 && !isIgnorableLatexForwardSyncLine(line.text)) {
        return {
          line: line.number,
          column: firstMeaningfulColumn(line.text),
          semanticOrigin: 'environment-begin',
        }
      }
    }
  }

  if (boundary?.kind === 'environment' && boundary.type === 'end') {
    let depth = 0
    for (let lineNumber = currentLine.number - 1; lineNumber >= 1; lineNumber -= 1) {
      const line = document.line(lineNumber)
      const lineBoundary = parseLatexDisplayMathBoundary(line.text)
      if (lineBoundary?.kind === 'environment' && lineBoundary.token === boundary.token) {
        if (lineBoundary.type === 'end') {
          depth += 1
          continue
        }
        if (lineBoundary.type === 'begin') {
          if (depth === 0) break
          depth -= 1
          continue
        }
      }
      if (depth === 0 && !isIgnorableLatexForwardSyncLine(line.text)) {
        return {
          line: line.number,
          column: firstMeaningfulColumn(line.text),
          semanticOrigin: 'environment-end',
        }
      }
    }
  }

  if (boundary?.kind === 'delimiter' && boundary.token === '\\[' && boundary.type === 'begin') {
    for (let lineNumber = currentLine.number + 1; lineNumber <= document.lines; lineNumber += 1) {
      const line = document.line(lineNumber)
      const lineBoundary = parseLatexDisplayMathBoundary(line.text)
      if (lineBoundary?.kind === 'delimiter' && lineBoundary.token === '\\[' && lineBoundary.type === 'end') {
        break
      }
      if (!isIgnorableLatexForwardSyncLine(line.text)) {
        return {
          line: line.number,
          column: firstMeaningfulColumn(line.text),
          semanticOrigin: 'environment-begin',
        }
      }
    }
  }

  if (boundary?.kind === 'delimiter' && boundary.token === '\\[' && boundary.type === 'end') {
    for (let lineNumber = currentLine.number - 1; lineNumber >= 1; lineNumber -= 1) {
      const line = document.line(lineNumber)
      const lineBoundary = parseLatexDisplayMathBoundary(line.text)
      if (lineBoundary?.kind === 'delimiter' && lineBoundary.token === '\\[' && lineBoundary.type === 'begin') {
        break
      }
      if (!isIgnorableLatexForwardSyncLine(line.text)) {
        return {
          line: line.number,
          column: firstMeaningfulColumn(line.text),
          semanticOrigin: 'environment-end',
        }
      }
    }
  }

  return {
    line: currentLine.number,
    column: Math.max(1, pos - currentLine.from + 1),
    semanticOrigin: 'direct',
  }
}

async function handleFormatDocument() {
  if (!view || !isLatexEditor) return

  if (!latexStore.hasLatexFormatter) {
    void latexStore.checkTools().catch(() => {})
    toastStore.showOnce(
      'latex-format-unavailable',
      t('LaTeX formatter is not available.'),
      { type: 'error', duration: 4000 },
      5000
    )
    return
  }

  try {
    const formatted = await latexStore.formatDocument(props.filePath, view.state.doc.toString())
    if (typeof formatted !== 'string' || formatted === view.state.doc.toString()) return
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: formatted,
      },
    })
  } catch (error) {
    toastStore.showOnce(
      'latex-format-failed',
      t('LaTeX formatting failed: {error}', {
        error: error?.message || String(error || ''),
      }),
      { type: 'error', duration: 5000 },
      3000
    )
  }
}

function handleFormatMarkdownTable() {
  if (!view || !isMd) return
  formatCurrentMarkdownTable(view)
}

function handleInsertMarkdownTable() {
  if (!view || !isMd) return
  insertMarkdownTable(view)
}

function shouldPadCitationEdge(char = '') {
  return Boolean(char) && !/[\s[({,;:!?]/.test(char)
}

function shouldPadCitationTrailingEdge(char = '') {
  return Boolean(char) && !/\s|[\])},;:!?]/.test(char)
}

function applyCitationSpacing(insertText, from, to) {
  if (!view || workspace.citationInsertAddsSpace !== true) {
    return {
      text: insertText,
      from,
      to,
    }
  }

  const doc = view.state.doc
  const previousChar = from > 0 ? doc.sliceString(from - 1, from) : ''
  const nextChar = to < doc.length ? doc.sliceString(to, to + 1) : ''

  let text = insertText
  if (shouldPadCitationEdge(previousChar) && !text.startsWith(' ')) {
    text = ` ${text}`
  }
  if (shouldPadCitationTrailingEdge(nextChar) && !text.endsWith(' ')) {
    text = `${text} `
  }

  return { text, from, to }
}

function buildMarkdownCitationInsertText(key) {
  if (citPalette.insideBrackets) return `@${key}`
  return workspace.markdownCitationFormat === 'bare' ? `@${key}` : `[@${key}]`
}

function buildLatexCitationInsertText(key, latexCommand = null) {
  const command = latexCommand || workspace.latexCitationCommand || 'cite'
  return citPalette.insideBrackets ? key : `\\${command}{${key}}`
}

function openCitationPaletteAtCursor() {
  if (!view) return

  const selection = view.state.selection.main
  const from = selection?.from ?? 0
  const to = selection?.to ?? from
  const anchor = to
  const coords = view.coordsAtPos(anchor) || view.coordsAtPos(from)
  const fallbackRect = editorContainer.value?.getBoundingClientRect?.()

  citPalette.show = true
  citPalette.mode = 'insert'
  citPalette.x = coords?.left ?? fallbackRect?.left ?? 0
  citPalette.y = (coords?.bottom ?? fallbackRect?.top ?? 0) + 2
  citPalette.query = ''
  citPalette.cites =[]
  citPalette.triggerFrom = from
  citPalette.triggerTo = to
  citPalette.insideBrackets = false
  citPalette.latexCommand = isLatexEditor ? workspace.latexCitationCommand : null
}

function handleInsertCitation() {
  if (!view || (!isMd && !isLatexEditor)) return
  closeContextMenu()
  openCitationPaletteAtCursor()
  view.focus()
}

function onCitInsert({ keys =[], stayOpen = false, latexCommand = null }) {
  if (!view || keys.length === 0) return
  const key = keys[0]
  const nextText = isLatexEditor
    ? buildLatexCitationInsertText(key, latexCommand)
    : buildMarkdownCitationInsertText(key)
  const change = applyCitationSpacing(nextText, citPalette.triggerFrom, citPalette.triggerTo)
  view.dispatch({
    changes: { from: change.from, to: change.to, insert: change.text },
  })

  if (stayOpen && !isLatexEditor) {
    const cursor = view.state.selection.main.head
    const line = view.state.doc.lineAt(cursor)
    CITATION_GROUP_RE.lastIndex = 0
    let match
    while ((match = CITATION_GROUP_RE.exec(line.text)) !== null) {
      const groupFrom = line.from + match.index
      const groupTo = groupFrom + match[0].length
      if (cursor >= groupFrom && cursor <= groupTo) {
        citPalette.mode = 'edit'
        citPalette.groupFrom = groupFrom
        citPalette.groupTo = groupTo
        citPalette.cites = parseCitationGroup(match[0])
        citPalette.query = ''
        return
      }
    }
  }

  citPalette.show = false
  view.focus()
}

function onCitUpdate({ cites =[] }) {
  if (!view) return

  if (isLatexEditor) {
    const keys = cites.map((cite) => cite.key)
    const command = citPalette.latexCommand || workspace.latexCitationCommand || 'cite'
    const text = `\\${command}{${keys.join(', ')}}`
    view.dispatch({
      changes: { from: citPalette.groupFrom, to: citPalette.groupTo, insert: text },
    })
    citPalette.groupTo = citPalette.groupFrom + text.length
    return
  }

  if (cites.length === 0) {
    view.dispatch({
      changes: { from: citPalette.groupFrom, to: citPalette.groupTo, insert: '' },
    })
    citPalette.show = false
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
  view.dispatch({
    changes: { from: citPalette.groupFrom, to: citPalette.groupTo, insert: text },
  })
  citPalette.groupTo = citPalette.groupFrom + text.length
}

function onCitClose() {
  citPalette.show = false
  view?.focus()
}

function parseCitationGroup(text = '') {
  const inner = text.slice(1, -1)
  const parts = inner
    .split(/\s*;\s*|\s*,\s*(?=@)/)
    .map((segment) => segment.trim())
    .filter(Boolean)

  const cites =[]
  for (const part of parts) {
    const keyMatch = part.match(/@([a-zA-Z][\w.-]*)/)
    if (!keyMatch) continue
    const key = keyMatch[1]
    const afterKey = part
      .substring(part.indexOf(keyMatch[0]) + keyMatch[0].length)
      .replace(/^[\s,]+/, '')
    const prefix = part.substring(0, part.indexOf(keyMatch[0])).trim()
    cites.push({ key, locator: afterKey, prefix })
  }
  return cites
}

async function persistDraftContent(content) {
  const currentContent =
    typeof content === 'string' ? content : view ? view.state.doc.toString() : ''
  const selectedPath = await files.promptAndSaveDraft(props.filePath, currentContent)
  if (!selectedPath) return false

  lastPersistedContent = currentContent
  editorStore.updateFilePath(props.filePath, selectedPath)
  editorStore.clearFileDirty(selectedPath)
  void files.revealPath(selectedPath)
  return true
}

async function persistEditorContent(content, options = {}) {
  const currentContent =
    typeof content === 'string' ? content : view ? view.state.doc.toString() : ''
  const suppressLatexAutoBuild = options.suppressLatexAutoBuild === true

  if (currentContent === lastPersistedContent && latexNormalizedSaveContent == null) {
    editorStore.clearFileDirty(props.filePath)
    return true
  }

  if (isDraftFile) {
    return persistDraftContent(currentContent)
  }

  if (isLatexEditor) {
    if (latexNormalizedSaveContent != null && currentContent === latexNormalizedSaveContent) {
      latexNormalizedSaveContent = null
      lastPersistedContent = currentContent
      editorStore.clearFileDirty(props.filePath)
      return true
    }

    let nextContent = currentContent
    if (latexStore.formatOnSave && latexStore.hasLatexFormatter && !latexFormatOnSaveInFlight) {
      try {
        latexFormatOnSaveInFlight = true
        const formatted = await latexStore.formatDocument(props.filePath, currentContent)
        if (typeof formatted === 'string' && formatted !== currentContent) {
          nextContent = formatted
          latexNormalizedSaveContent = formatted
          if (view && view.state.doc.toString() !== formatted) {
            const selection = view.state.selection.main
            view.dispatch({
              changes: {
                from: 0,
                to: view.state.doc.length,
                insert: formatted,
              },
              selection: {
                anchor: Math.min(selection.anchor, formatted.length),
                head: Math.min(selection.head, formatted.length),
              },
            })
          }
        }
      } catch (error) {
        toastStore.showOnce(
          'latex-format-on-save-failed',
          t('LaTeX format on save failed: {error}', {
            error: error?.message || String(error || ''),
          }),
          { type: 'error', duration: 5000 },
          3000
        )
      } finally {
        latexFormatOnSaveInFlight = false
      }
    }

    const saved = await files.saveFile(props.filePath, nextContent)
    if (!saved) return false
    lastPersistedContent = nextContent
    editorStore.clearFileDirty(props.filePath)
    if (supportsLatexRuntime && !suppressLatexAutoBuild) {
      void latexStore.scheduleAutoBuildForPath(props.filePath, {
        sourceContent: nextContent,
      })
    }
    return true
  }

  const saved = await files.saveFile(props.filePath, currentContent)
  if (!saved) return false
  lastPersistedContent = currentContent
  editorStore.clearFileDirty(props.filePath)
  return true
}

function handleDocumentChanged(content) {
  files.setInMemoryFileContent(props.filePath, content)
  if (content === lastPersistedContent) {
    editorStore.clearFileDirty(props.filePath)
    return
  }
  editorStore.markFileDirty(props.filePath)
}

async function loadLanguageExtension() {
  const { languages } = await import('@codemirror/language-data')
  const ext = basenamePath(props.filePath).split('.').pop()?.toLowerCase() || ''
  if (isMd) {
    const { markdown, markdownLanguage } = await import('@codemirror/lang-markdown')
    return markdown({ base: markdownLanguage, codeLanguages: languages })
  }
  if (isLatexEditor) {
    const { altalsLatexLanguage, ensureLatexTextmateReady } = await import('../../editor/latexLanguage')
    await ensureLatexTextmateReady()
    return altalsLatexLanguage
  }
  if (ext === 'm') {
    const octave = languages.find((lang) => lang.name === 'Octave')
    if (octave) {
      return octave.load()
    }
  }

  const matched = languages.filter((lang) => {
    const name = basenamePath(props.filePath)
    if (lang.filename && lang.filename.test(name)) return true
    if (lang.extensions) {
      const dot = name.lastIndexOf('.')
      if (dot > 0) {
        const ext = name.substring(dot + 1)
        return lang.extensions.includes(ext)
      }
    }
    return false
  })

  if (matched.length > 0) {
    return matched[0].load()
  }
  return null
}

onMounted(async () => {
  if (!editorContainer.value) return

  let content = files.fileContents[props.filePath]
  if (content === undefined) {
    content = isDraftFile ? '' : await files.readFile(props.filePath)
  }
  if (content === null && loadError.value) return
  if (content === null) content = ''

  lastPersistedContent = content
  editorStore.clearFileDirty(props.filePath)

  if (supportsLatexRuntime) {
    scheduleLatexWarmup(content)
  }

  const langExt = await loadLanguageExtension()
  const extraExtensions =[
    ...createFoldingExtension(props.filePath),
    ...createRevealHighlightExtension(),
    EditorView.updateListener.of((update) => {
      // 触发 Zen 专注模式事件
      if (update.docChanged && update.selectionSet) {
        window.dispatchEvent(new CustomEvent('editor-typing'))
      }
      if (update.selectionSet || update.docChanged) {
        const selection = update.state.selection.main
        emit('selection-change', {
          filePath: props.filePath,
          hasSelection: selection.from !== selection.to,
          from: selection.from,
          to: selection.to,
          text:
            selection.from !== selection.to
              ? update.state.sliceDoc(selection.from, selection.to)
              : '',
        })
      }
      if (isMd && update.selectionSet) {
        scheduleMarkdownSelectionPreviewSync(update.state.selection.main)
      }
      if (isMd && update.viewportChanged) {
        scheduleMarkdownViewportPreviewSync(update.view)
      }
    }),
  ]

  // ===============================================
  // 学术魔法：加入自动识别文献的 Hover Tooltip 悬浮卡片
  // ===============================================
  extraExtensions.push(
    hoverTooltip((view, pos, _side) => {
      const { from, text } = view.state.doc.lineAt(pos)
      // 匹配 Markdown [@Smith2024] 或者 LaTeX \cite{Smith2024} 等
      const re = /\[@([^\]]+)\]|\\[a-zA-Z]*cite[a-zA-Z]*\*?(?:\[[^\]]*\])*\{([^}]+)\}/g
      let match
      while ((match = re.exec(text)) !== null) {
        const start = from + match.index
        const end = start + match[0].length
        if (pos >= start && pos <= end) {
          const rawKeys = match[1] || match[2]
          const keys = rawKeys.split(',').map(k => k.trim())

          return {
            pos: start,
            end,
            above: true,
            create(_view) {
              const dom = document.createElement("div")
              dom.className = "cm-citation-hover-card"

              const refsHtml = keys.map(k => {
                const ref = referencesStore.getByKey(k)
                if (ref) {
                  const author = Array.isArray(ref.authors) && ref.authors.length > 0 
                    ? (ref.authors[0] + (ref.authors.length > 1 ? ' et al.' : '')) 
                    : 'Unknown'
                  return `
                    <div class="cit-hover-item">
                      <div class="cit-hover-title">${ref.title || k}</div>
                      <div class="cit-hover-meta">${author} · ${ref.year || ''}</div>
                    </div>
                  `
                }
                return `<div class="cit-hover-item"><div class="cit-hover-meta">Unknown reference: ${k}</div></div>`
              }).join('<div class="cit-hover-separator"></div>')

              dom.innerHTML = refsHtml
              return { dom }
            }
          }
        }
      }
      return null
    })
  )

  if (isMd) {
    const [{ autocompletion }, { createMarkdownDraftEditorExtensions }] = await Promise.all([
      import('@codemirror/autocomplete'),
      import('../../editor/markdownDraftAssist'),
    ])
    const completionSources = [createMarkdownDraftSnippetSource(t)]
    if (!isDraftFile) {
      const wikiLinks = wikiLinksExtension({
        resolveLink: (target, fromPath) => linksStore.resolveLink(target, fromPath),
        getFiles: () => linksStore.allFileNames,
        getHeadings: (target) => {
          const resolved = linksStore.resolveLink(target, props.filePath)
          if (!resolved) return null
          return linksStore.headingsForFile(resolved.path)
        },
        currentFilePath: () => props.filePath,
      })
      extraExtensions.push(...wikiLinks.extensions)
      completionSources.push(wikiLinks.completionSource)
    }

    extraExtensions.push(
      ...citationsExtension(referencesStore, {
        isOpen: () => citPalette.show,
        onOpen: ({ x, y, query, triggerFrom, triggerTo, insideBrackets }) => {
          citPalette.show = true
          citPalette.mode = 'insert'
          citPalette.x = x
          citPalette.y = y
          citPalette.query = query
          citPalette.cites =[]
          citPalette.triggerFrom = triggerFrom
          citPalette.triggerTo = triggerTo
          citPalette.insideBrackets = insideBrackets
          citPalette.latexCommand = null
        },
        onQueryChange: (query, triggerTo) => {
          citPalette.query = query
          citPalette.triggerTo = triggerTo
        },
        onDismiss: () => {
          citPalette.show = false
        },
      }).extensions
    )

    extraExtensions.push(
      autocompletion({
        override: completionSources,
        activateOnTyping: true,
        activateOnTypingDelay: 0,
        defaultKeymap: true,
      })
    )

    const { markdownShortcuts } = await import('../../editor/markdownShortcuts')
    extraExtensions.push(markdownShortcuts())
    extraExtensions.push(...createMarkdownDraftEditorExtensions({ t }))
  }

  if (isLatexEditor) {
    const [
      { autocompletion },
      { createLatexCompletionSource },
      { createLatexTextmateHighlightExtension },
    ] = await Promise.all([
      import('@codemirror/autocomplete'),
      import('../../editor/latexAutocomplete'),
      import('../../editor/latexLanguage'),
    ])
    extraExtensions.push(createLatexTextmateHighlightExtension())
    extraExtensions.push(
      ...latexCitationsExtension(referencesStore, {
        isOpen: () => citPalette.show,
        onOpen: ({ x, y, query, triggerFrom, triggerTo, insideBrackets, latexCommand }) => {
          citPalette.show = true
          citPalette.mode = 'insert'
          citPalette.x = x
          citPalette.y = y
          citPalette.query = query
          citPalette.cites =[]
          citPalette.triggerFrom = triggerFrom
          citPalette.triggerTo = triggerTo
          citPalette.insideBrackets = insideBrackets
          citPalette.latexCommand = latexCommand
        },
        onQueryChange: (query, triggerTo, triggerFrom) => {
          citPalette.query = query
          citPalette.triggerTo = triggerTo
          citPalette.triggerFrom = triggerFrom
        },
        onDismiss: () => {
          citPalette.show = false
        },
      }).extensions
    )

    extraExtensions.push(
      autocompletion({
        override:[
          createLatexCompletionSource({
            filePath: props.filePath,
            filesStore: files,
            workspacePath: workspace.path,
          }),
        ],
        activateOnTyping: true,
        activateOnTypingDelay: 0,
        defaultKeymap: true,
      })
    )

    extraExtensions.push(
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-Shift-f',
            run: () => {
              void handleFormatDocument()
              return true
            },
          },
          {
            key: 'Shift-Alt-f',
            run: () => {
              void handleFormatDocument()
              return true
            },
          },
        ])
      )
    )
  }

  const buildExtensions = (languageExtension, runtimeExtensions) => createEditorExtensions({
    softWrap: true,
    wrapColumn: workspace.wrapColumn,
    spellcheckEnabled: workspace.editorSpellcheck,
    showLineNumbers: workspace.editorLineNumbers,
    highlightActiveLineEnabled: workspace.editorHighlightActiveLine,
    languageExtension,
    autoSaveEnabled: workspace.autoSave && !isDraftFile,
    onDocChanged: handleDocumentChanged,
    onSave: (nextContent) => {
      void persistEditorContent(nextContent)
    },
    onCursorChange: (pos) => emit('cursor-change', pos),
    onStats: (stats) => emit('editor-stats', stats),
    extraExtensions: runtimeExtensions,
  })

  try {
    const extensions = buildExtensions(langExt, extraExtensions)
    view = new EditorView({
      state: createEditorState(content, extensions),
      parent: editorContainer.value,
    })
  } catch (error) {
    console.error('[editor] failed to initialize rich editor, falling back to plain text:', error)
    toastStore.showOnce(
      `editor-init:${props.filePath}`,
      t('Editor language features failed to load. Falling back to plain text.'),
      { type: 'error', duration: 5000 },
      1000
    )
    const fallbackExtensions = buildExtensions(null, [])
    view = new EditorView({
      state: createEditorState(content, fallbackExtensions),
      parent: editorContainer.value,
    })
  }

  view.altalsPersist = async (options = {}) =>
    persistEditorContent(view?.state.doc.toString() || '', options)
  view.altalsGetContent = () => view?.state.doc.toString() || ''
  view.altalsApplyExternalContent = async (nextContent = '') => {
    const normalizedContent = typeof nextContent === 'string' ? nextContent : ''
    if (!view) return false

    lastPersistedContent = normalizedContent
    if (view.state.doc.toString() !== normalizedContent) {
      const selection = view.state.selection.main
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: normalizedContent,
        },
        selection: {
          anchor: Math.min(selection.anchor, normalizedContent.length),
          head: Math.min(selection.head, normalizedContent.length),
        },
      })
    } else {
      files.setInMemoryFileContent(props.filePath, normalizedContent)
      editorStore.clearFileDirty(props.filePath)
    }

    return true
  }

  activateEditorRuntime()
})

function ensureLatexWindowHandlers() {
  if (!supportsLatexRuntime) return

  if (!backwardSyncHandler) {
    backwardSyncHandler = async (event) => {
      const { file, line, column, textBeforeSelection, textAfterSelection, strictLine } =
        event.detail || {}
      const normalizedFile = String(file || '').replace(/\\/g, '/')
      const normalizedCurrentPath = String(props.filePath || '').replace(/\\/g, '/')
      const location = {
        filePath: normalizedFile || normalizedCurrentPath,
        line,
        column,
        textBeforeSelection,
        textAfterSelection,
        strictLine,
      }
      if (normalizedFile) {
        const targetFileName = basenamePath(normalizedFile) || normalizedFile
        const currentFileName = basenamePath(normalizedCurrentPath) || normalizedCurrentPath
        const exactMatch = normalizedFile === normalizedCurrentPath
        const fileNameOnlyMatch =
          !normalizedFile.includes('/') && targetFileName === currentFileName
        if (!exactMatch && !fileNameOnlyMatch) {
          if (editorStore.activeTab !== props.filePath) return
          await revealLatexSourceLocation(editorStore, location, {
            paneId: props.paneId,
            center: true,
          })
          return
        }
      }
      if (line && line > 0) {
        await revealLatexSourceLocation(editorStore, location, {
          paneId: props.paneId,
          center: true,
        })
      }
    }
  }

}

function ensureLatexEditorHandlers() {
  if (!supportsLatexRuntime) return

  if (!latexSourceDoubleClickHandler) {
    latexSourceDoubleClickHandler = async (event) => {
      if (!view || event.button !== 0) return

      const posFromEvent = view.posAtCoords({ x: event.clientX, y: event.clientY })
      const pos =
        posFromEvent == null ? Number(view.state.selection.main.head || 0) : Number(posFromEvent)
      if (!Number.isInteger(pos) || pos < 0) return

      const target = resolveLatexForwardSyncTarget(view, pos)
      if (!target?.line) return
      const syncDetail = {
        sourcePath: props.filePath,
        filePath: props.filePath,
        line: target.line,
        column: target.column,
        paneId: props.paneId,
        reason: 'double-click',
      }

      await workflowStore.revealWorkflowPdfForFile(props.filePath, {
        sourcePaneId: props.paneId,
        trigger: 'latex-source-double-click-sync',
      })

      dispatchLatexForwardSync(window, syncDetail)
    }
  }
}

function ensureMarkdownWindowHandlers() {
  if (!isMd) return

  if (!markdownCursorRequestHandler) {
    markdownCursorRequestHandler = (event) => {
      if (!view || event.detail?.sourcePath !== props.filePath) return
      const pos = view.state.selection.main.head
      const location = getMarkdownSyncLocation(pos)
      if (!location) return

      rememberPendingMarkdownForwardSync({
        sourcePath: props.filePath,
        line: location.line,
        offset: location.offset,
      })

      dispatchMarkdownForwardSync({
        sourcePath: props.filePath,
        line: location.line,
        offset: location.offset,
        reason: 'selection',
      })
    }
  }

  if (!markdownBackwardSyncHandler) {
    markdownBackwardSyncHandler = (event) => {
      if (!view || event.detail?.sourcePath !== props.filePath) return
      scrollMarkdownEditorToLocation(event.detail || {})
    }
  }
}

function attachEditorRuntimeListeners() {
  editorContainer.value?.addEventListener('mousedown', handleContextMenuMouseDown, true)
  if (isMd && !isDraftFile) {
    editorContainer.value?.addEventListener('click', handleWikiLinkClick)
    editorContainer.value?.addEventListener('click', handleCitationClick)
  }
  if (supportsLatexRuntime) {
    editorContainer.value?.addEventListener('click', handleLatexCitationClick)
    ensureLatexEditorHandlers()
    editorContainer.value?.addEventListener('dblclick', latexSourceDoubleClickHandler)
  }

  if (isMd && !isDraftFile) {
    ensureMarkdownWindowHandlers()
    window.addEventListener('markdown-request-cursor', markdownCursorRequestHandler)
    if (markdownBackwardSyncHandler) {
      window.addEventListener(MARKDOWN_BACKWARD_SYNC_EVENT, markdownBackwardSyncHandler)
    }
  }
  if (supportsLatexRuntime) {
    ensureLatexWindowHandlers()
    window.addEventListener(LATEX_BACKWARD_SYNC_EVENT, backwardSyncHandler)
  }
}

function detachEditorRuntimeListeners() {
  editorContainer.value?.removeEventListener('mousedown', handleContextMenuMouseDown, true)
  if (isMd && !isDraftFile) {
    editorContainer.value?.removeEventListener('click', handleWikiLinkClick)
    editorContainer.value?.removeEventListener('click', handleCitationClick)
  }
  if (supportsLatexRuntime) {
    editorContainer.value?.removeEventListener('click', handleLatexCitationClick)
    if (latexSourceDoubleClickHandler) {
      editorContainer.value?.removeEventListener('dblclick', latexSourceDoubleClickHandler)
    }
  }
  if (markdownCursorRequestHandler) {
    window.removeEventListener('markdown-request-cursor', markdownCursorRequestHandler)
  }
  if (markdownBackwardSyncHandler) {
    window.removeEventListener(MARKDOWN_BACKWARD_SYNC_EVENT, markdownBackwardSyncHandler)
  }
  if (backwardSyncHandler) {
    window.removeEventListener(LATEX_BACKWARD_SYNC_EVENT, backwardSyncHandler)
  }
}

function activateEditorRuntime() {
  if (!view || editorRuntimeActive) return
  editorRuntimeActive = true
  editorStore.registerEditorView(props.paneId, props.filePath, view)
  attachEditorRuntimeListeners()
  showMergeViewIfNeeded()
  requestAnimationFrame(() => {
    view?.requestMeasure?.()
  })
}

function deactivateEditorRuntime() {
  if (!editorRuntimeActive) return
  editorRuntimeActive = false
  ctxMenu.show = false
  pendingContextMenuState = null
  clearContextMenuRestoreHandles()
  detachEditorRuntimeListeners()
  editorStore.unregisterEditorView(props.paneId, props.filePath)
}

onActivated(() => {
  activateEditorRuntime()
})

onDeactivated(() => {
  deactivateEditorRuntime()
})

function handleWikiLinkClick(event) {
  if (!view) return

  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
  if (pos === null) return

  const line = view.state.doc.lineAt(pos)
  const lineText = line.text
  const wikiLinkPattern = /\[\[([^\]]+)\]\]/g
  let match

  while ((match = wikiLinkPattern.exec(lineText)) !== null) {
    const matchFrom = line.from + match.index
    const matchTo = matchFrom + match[0].length
    if (pos < matchFrom || pos >= matchTo) continue

    let target = match[1]
    const pipeIndex = target.indexOf('|')
    if (pipeIndex !== -1) target = target.substring(0, pipeIndex)

    const hashIndex = target.indexOf('#')
    if (hashIndex !== -1) target = target.substring(0, hashIndex)
    target = target.trim()
    if (!target) return

    const resolved = linksStore.resolveLink(target, props.filePath)
    if (resolved) {
      editorStore.openFile(resolved.path)
    } else {
      const dir = dirnamePath(props.filePath)
      const newName = target.endsWith('.md') ? target : `${target}.md`
      files.createFile(dir, newName).then((newPath) => {
        if (newPath) editorStore.openFile(newPath)
      })
    }

    event.preventDefault()
    event.stopPropagation()
    return
  }
}

function handleCitationClick(event) {
  if (!view || event.metaKey || event.ctrlKey) return

  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
  if (pos === null) return

  const line = view.state.doc.lineAt(pos)
  CITATION_GROUP_RE.lastIndex = 0
  let match
  while ((match = CITATION_GROUP_RE.exec(line.text)) !== null) {
    const matchFrom = line.from + match.index
    const matchTo = matchFrom + match[0].length
    if (pos < matchFrom || pos >= matchTo) continue

    const coords = view.coordsAtPos(matchFrom)
    citPalette.show = true
    citPalette.mode = 'edit'
    citPalette.x = event.clientX
    citPalette.y = (coords?.bottom ?? event.clientY) + 2
    citPalette.groupFrom = matchFrom
    citPalette.groupTo = matchTo
    citPalette.cites = parseCitationGroup(match[0])
    citPalette.query = ''
    citPalette.latexCommand = null
    citPalette.insideBrackets = true
    event.preventDefault()
    event.stopPropagation()
    return
  }
}

function handleLatexCitationClick(event) {
  if (!view || event.metaKey || event.ctrlKey) return

  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
  if (pos === null) return

  const line = view.state.doc.lineAt(pos)
  LATEX_CITE_RE.lastIndex = 0
  let match
  while ((match = LATEX_CITE_RE.exec(line.text)) !== null) {
    const matchFrom = line.from + match.index
    const matchTo = matchFrom + match[0].length
    if (pos < matchFrom || pos >= matchTo) continue

    const coords = view.coordsAtPos(matchFrom)
    citPalette.show = true
    citPalette.mode = 'edit'
    citPalette.x = event.clientX
    citPalette.y = (coords?.bottom ?? event.clientY) + 2
    citPalette.groupFrom = matchFrom
    citPalette.groupTo = matchTo
    citPalette.cites = match[2]
      .split(',')
      .map((key) => String(key || '').trim())
      .filter(Boolean)
      .map((key) => ({ key, locator: '', prefix: '' }))
    citPalette.query = ''
    citPalette.latexCommand = match[1]
    citPalette.insideBrackets = true
    event.preventDefault()
    event.stopPropagation()
    return
  }
}

function scheduleMarkdownSelectionPreviewSync(selection) {
  if (!isMd || !view) return
  if (workspace.markdownPreviewSync) return
  if (!hasActiveMarkdownPreviewTarget()) return
  if ((selection?.from ?? 0) !== (selection?.to ?? 0)) return

  if (markdownPreviewSyncTimer != null) {
    window.clearTimeout(markdownPreviewSyncTimer)
    markdownPreviewSyncTimer = null
  }

  const pos = Number(selection?.head ?? -1)
  if (!Number.isInteger(pos) || pos < 0) return

  markdownPreviewSyncTimer = window.setTimeout(() => {
    markdownPreviewSyncTimer = null
    const location = getMarkdownSyncLocation(pos)
    if (!location) return

    rememberPendingMarkdownForwardSync({
      sourcePath: props.filePath,
      line: location.line,
      offset: location.offset,
    })

    dispatchMarkdownForwardSync({
      sourcePath: props.filePath,
      line: location.line,
      offset: location.offset,
      reason: 'selection',
    })
  }, 90)
}

function suppressMarkdownPreviewScrollSync(durationMs = 220) {
  suppressMarkdownPreviewScrollSyncUntil = Date.now() + Math.max(0, Number(durationMs) || 0)
}

function isMarkdownPreviewScrollSyncSuppressed() {
  return Date.now() < suppressMarkdownPreviewScrollSyncUntil
}

function getMarkdownViewportSyncLocation(targetView = view) {
  if (!targetView?.state?.doc) return null
  const viewportFrom = Number(targetView.viewport?.from ?? -1)
  const pos =
    Number.isInteger(viewportFrom) && viewportFrom >= 0
      ? viewportFrom
      : targetView.state.selection.main.head
  return getMarkdownSyncLocation(pos)
}

function scheduleMarkdownViewportPreviewSync(targetView = view) {
  if (!isMd || !targetView) return
  if (workspace.markdownPreviewSync !== true) return
  if (!hasActiveMarkdownPreviewTarget()) return
  if (isMarkdownPreviewScrollSyncSuppressed()) return

  if (markdownPreviewScrollSyncFrame != null) {
    window.cancelAnimationFrame(markdownPreviewScrollSyncFrame)
    markdownPreviewScrollSyncFrame = null
  }

  markdownPreviewScrollSyncFrame = window.requestAnimationFrame(() => {
    markdownPreviewScrollSyncFrame = null
    if (isMarkdownPreviewScrollSyncSuppressed()) return
    const location = getMarkdownViewportSyncLocation(targetView)
    if (!location) return

    dispatchMarkdownForwardSync({
      sourcePath: props.filePath,
      line: location.line,
      offset: location.offset,
      reason: 'editor-scroll',
    })
  })
}

function scrollMarkdownEditorToLocation(detail = {}) {
  if (!view?.state?.doc) return false

  let pos = Number(detail.offset ?? -1)
  if (!Number.isInteger(pos) || pos < 0) {
    const lineNumber = Math.max(1, Number(detail.line || 1))
    pos = view.state.doc.line(Math.min(lineNumber, view.state.doc.lines)).from
  }

  pos = Math.max(0, Math.min(pos, view.state.doc.length))

  const scroller = view.scrollDOM
  if (!scroller) return false

  let targetTop = null
  if (typeof view.lineBlockAt === 'function') {
    const block = view.lineBlockAt(pos)
    if (Number.isFinite(block?.top)) {
      targetTop = Math.max(0, Number(block.top) - 40)
    }
  }

  if (!Number.isFinite(targetTop)) {
    const coords = view.coordsAtPos(pos)
    const scrollerRect = scroller.getBoundingClientRect()
    if (coords && scrollerRect) {
      targetTop = Math.max(0, scroller.scrollTop + (coords.top - scrollerRect.top) - 40)
    }
  }

  if (!Number.isFinite(targetTop)) return false

  suppressMarkdownPreviewScrollSync()
  scroller.scrollTo({
    top: targetTop,
    behavior: 'auto',
  })
  return true
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

function getMarkdownSyncLocation(pos) {
  if (!view || !Number.isInteger(pos)) return null
  const line = view.state.doc.lineAt(pos)
  if (!line?.number || line.number < 1) return null
  return {
    line: line.number,
    offset: Math.max(0, pos),
  }
}

watch(
  () => workspace.wrapColumn,
  (column) => {
    if (!view) return
    view.dispatch({
      effects: columnWidthCompartment.reconfigure(columnWidthExtension(column)),
    })
  }
)

watch(
  () => workspace.markdownPreviewSync,
  (enabled) => {
    if (markdownPreviewSyncTimer != null) {
      window.clearTimeout(markdownPreviewSyncTimer)
      markdownPreviewSyncTimer = null
    }
    if (markdownPreviewScrollSyncFrame != null) {
      window.cancelAnimationFrame(markdownPreviewScrollSyncFrame)
      markdownPreviewScrollSyncFrame = null
    }

    if (!isMd || !view || !hasActiveMarkdownPreviewTarget()) return

    if (enabled) {
      scheduleMarkdownViewportPreviewSync(view)
      return
    }

    scheduleMarkdownSelectionPreviewSync(view.state.selection.main)
  }
)

watch(
  () => workspace.editorSpellcheck,
  (enabled) => {
    if (!view) return
    view.dispatch({
      effects: editorInputAttributesCompartment.reconfigure(
        editorInputAttributesExtension({ spellcheck: enabled })
      ),
    })
  }
)

watch(
  () => workspace.editorLineNumbers,
  (enabled) => {
    if (!view) return
    view.dispatch({
      effects: lineNumbersCompartment.reconfigure(lineNumbersExtension(enabled)),
    })
  }
)

watch(
  () => workspace.editorHighlightActiveLine,
  (enabled) => {
    if (!view) return
    view.dispatch({
      effects: activeLineCompartment.reconfigure(activeLineExtension(enabled)),
    })
  }
)

onUnmounted(() => {
  deactivateEditorRuntime()
  clearLatexWarmupHandle()
  if (markdownPreviewSyncTimer != null) {
    window.clearTimeout(markdownPreviewSyncTimer)
    markdownPreviewSyncTimer = null
  }
  if (markdownPreviewScrollSyncFrame != null) {
    window.cancelAnimationFrame(markdownPreviewScrollSyncFrame)
    markdownPreviewScrollSyncFrame = null
  }
  if (view) {
    view.destroy()
    view = null
  }
  pendingContextMenuState = null
  clearContextMenuRestoreHandles()
  backwardSyncHandler = null
  latexSourceDoubleClickHandler = null
  markdownCursorRequestHandler = null
  markdownBackwardSyncHandler = null
})
</script>

<style scoped>
.text-editor-shell {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--shell-editor-surface);
}

.text-editor-host {
  background: var(--shell-editor-surface);
}

.text-editor-load-error {
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--workspace-paper) 80%, transparent);
}
</style>
