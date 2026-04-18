<template>
  <div
    class="text-editor-shell h-full w-full"
    :class="{ 'cm-prose-file': isMd }"
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
    :show-markdown-insert-table="isMd"
    :show-markdown-format-table="ctxMenu.showMarkdownFormatTable"
    @close="closeContextMenu"
    @format-document="handleFormatDocument"
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
import {
  createEditorExtensions,
  createEditorState,
  wrapCompartment,
  columnWidthCompartment,
  columnWidthExtension,
} from '../../editor/setup'
import {
  getCssRootZoomScale,
  getZoomCompensatedClientPoint,
  zoomAwareMouseSelectionExtension,
} from '../../editor/zoomCompensation'
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
import { useEditorRuntimeStore } from '../../stores/editorRuntime'
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
import { rememberPendingMarkdownForwardSync } from '../../services/markdown/previewSync.js'
import { readWorkspaceTextFile, saveWorkspaceTextFile } from '../../services/fileStoreIO.js'
import EditorContextMenu from './EditorContextMenu.vue'
import CitationPalette from './CitationPalette.vue'
import { useTextEditorBridges } from '../../composables/useTextEditorBridges'
import { useI18n } from '../../i18n'
import {
  createEditorRuntimeContract,
  emitEditorRuntimeTelemetry,
} from '../../domains/editor/editorRuntimeContract'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
})

const emit = defineEmits(['cursor-change', 'editor-stats', 'selection-change'])

const editorContainer = ref(null)
const files = useFilesStore()
const editorStore = useEditorStore()
const editorRuntimeStore = useEditorRuntimeStore()
const workspace = useWorkspaceStore()
const workflowStore = useDocumentWorkflowStore()
const linksStore = useLinksStore()
const toastStore = useToastStore()
const latexStore = useLatexStore()
const referencesStore = useReferencesStore()
const { t } = useI18n()
const loadError = computed(() => files.getFileLoadError(props.filePath))

async function appendLatexSyncDebug(entry = {}) {
  const workspacePath = String(workspace.path || '').trim()
  if (!workspacePath) return
  const logPath = `${workspacePath}/${LATEX_SYNC_DEBUG_LOG}`
  const line = `${JSON.stringify({
    ts: new Date().toISOString(),
    stage: 'editor',
    filePath: props.filePath,
    paneId: props.paneId,
    ...entry,
  })}\n`
  try {
    const previous = await readWorkspaceTextFile(logPath).catch(() => '')
    await saveWorkspaceTextFile(logPath, `${previous}${line}`)
  } catch {
    // Ignore debug log failures.
  }
}

let view = null
let editorRuntimeHandle = null
let backwardSyncHandler = null
let latexCursorRequestHandler = null
let markdownCursorRequestHandler = null
let markdownPreviewSyncTimer = null
let editorRuntimeActive = false
let pendingContextMenuState = null
let contextMenuRestoreFrame = null
let contextMenuRestoreTimeout = null
let latexNormalizedSaveContent = null
let latexFormatOnSaveInFlight = false
let latexWarmupHandle = null
let lastPersistedContent = ''
let nativeRuntimeSyncQueue = Promise.resolve()
let latestDiagnostics = []
let latestOutlineContext = null
const LATEX_SYNC_DEBUG_LOG = '.altals-latex-sync-debug.jsonl'

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
  cites: [],
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

  const coords = getZoomCompensatedClientPoint(event)
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

function onCitInsert({ keys = [], stayOpen = false, latexCommand = null }) {
  if (!view || keys.length === 0) return
  const key = keys[0]

  if (isLatexEditor && latexCommand) {
    const text = citPalette.insideBrackets ? key : `\\${latexCommand}{${key}}`
    view.dispatch({
      changes: { from: citPalette.triggerFrom, to: citPalette.triggerTo, insert: text },
    })
  } else {
    const text = citPalette.insideBrackets ? `@${key}` : `[@${key}]`
    view.dispatch({
      changes: { from: citPalette.triggerFrom, to: citPalette.triggerTo, insert: text },
    })
  }

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

function onCitUpdate({ cites = [] }) {
  if (!view) return

  if (isLatexEditor) {
    const keys = cites.map((cite) => cite.key)
    const command = citPalette.latexCommand || 'cite'
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

  const cites = []
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

async function persistEditorContent(content) {
  const currentContent =
    typeof content === 'string' ? content : view ? view.state.doc.toString() : ''

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
    if (supportsLatexRuntime) {
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
  emitEditorRuntimeTelemetry({
    type: 'content-change',
    runtimeKind: 'web',
    paneId: props.paneId,
    filePath: props.filePath,
    textLength: content.length,
  })
  if (content === lastPersistedContent) {
    editorStore.clearFileDirty(props.filePath)
    return
  }
  editorStore.markFileDirty(props.filePath)
}

function requestCurrentSelection() {
  if (!view) return null
  const selection = view.state.selection.main
  return {
    filePath: props.filePath,
    hasSelection: selection.from !== selection.to,
    anchor: selection.anchor,
    head: selection.head,
    from: selection.from,
    to: selection.to,
    text:
      selection.from !== selection.to
        ? view.state.sliceDoc(selection.from, selection.to)
        : '',
  }
}

function shouldMirrorToNativeRuntime() {
  return editorRuntimeStore.wantsNativeRuntime && !!props.filePath
}

function queueNativeRuntimeSync(task) {
  if (!shouldMirrorToNativeRuntime()) return Promise.resolve(false)
  nativeRuntimeSyncQueue = nativeRuntimeSyncQueue
    .catch(() => false)
    .then(async () => {
      try {
        return await task()
      } catch (error) {
        console.warn('[editor] failed to sync native runtime:', error)
        return false
      }
    })
  return nativeRuntimeSyncQueue
}

async function mirrorDocumentToNativeRuntime(content = null) {
  if (!shouldMirrorToNativeRuntime()) return false
  const text = typeof content === 'string' ? content : view?.state?.doc?.toString?.() || ''
  await editorRuntimeStore.syncShadowDocument({
    path: props.filePath,
    text,
  })
  return true
}

async function syncSelectionToNativeRuntime(selection = null, viewportOffset = null) {
  if (!shouldMirrorToNativeRuntime()) return false
  const currentSelection = selection || requestCurrentSelection()
  if (!currentSelection) return false
  await editorRuntimeStore.setNativeSelections({
    path: props.filePath,
    selections: [
      {
        anchor:
          currentSelection.anchor === undefined ? currentSelection.from : currentSelection.anchor,
        head: currentSelection.head === undefined ? currentSelection.to : currentSelection.head,
      },
    ],
    viewportOffset:
      viewportOffset === null || viewportOffset === undefined
        ? currentSelection.to
        : viewportOffset,
  })
  return true
}

async function syncDiagnosticsToNativeRuntime(diagnostics = []) {
  if (!shouldMirrorToNativeRuntime()) return false
  await editorRuntimeStore.setNativeDiagnostics({
    path: props.filePath,
    diagnostics: Array.isArray(diagnostics) ? diagnostics : [],
  })
  return true
}

async function syncOutlineContextToNativeRuntime(context = null) {
  if (!shouldMirrorToNativeRuntime()) return false
  await editorRuntimeStore.setNativeOutlineContext({
    path: props.filePath,
    context,
  })
  return true
}

function revealEditorRange(from, to = from, options = {}) {
  if (!view?.state?.doc) return false
  const length = view.state.doc.length
  const safeFrom = Math.max(0, Math.min(Number(from) || 0, length))
  const safeTo = Math.max(safeFrom, Math.min(Number(to) || safeFrom, length))

  view.dispatch({
    selection: {
      anchor: safeFrom,
      head: safeTo,
    },
    effects: EditorView.scrollIntoView(safeFrom, {
      y: options.center === false ? 'nearest' : 'center',
      yMargin: 80,
    }),
  })

  if (options.focus !== false) {
    view.focus()
  }

  emitEditorRuntimeTelemetry({
    type: 'reveal-range',
    runtimeKind: 'web',
    paneId: props.paneId,
    filePath: props.filePath,
    from: safeFrom,
    to: safeTo,
  })

  void queueNativeRuntimeSync(async () => {
    await mirrorDocumentToNativeRuntime(view.state.doc.toString())
    return syncSelectionToNativeRuntime(
      {
        filePath: props.filePath,
        hasSelection: safeFrom !== safeTo,
        from: safeFrom,
        to: safeTo,
        text: safeFrom !== safeTo ? view.state.sliceDoc(safeFrom, safeTo) : '',
      },
      safeFrom
    )
  })

  return true
}

function revealEditorOffset(offset, options = {}) {
  return revealEditorRange(offset, offset, options)
}

function destroyEditorView() {
  if (!view) return
  const currentView = view
  view = null
  currentView.destroy()
}

async function loadLanguageExtension() {
  const { languages } = await import('@codemirror/language-data')
  if (isMd) {
    const { markdown, markdownLanguage } = await import('@codemirror/lang-markdown')
    return markdown({ base: markdownLanguage, codeLanguages: languages })
  }
  if (isLatexEditor) {
    const { altalsLatexLanguage } = await import('../../editor/latexLanguage')
    return altalsLatexLanguage
  }

  const matched = languages.filter((lang) => {
    const name = props.filePath.split('/').pop() || ''
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
  const extraExtensions = [
    Prec.highest(zoomAwareMouseSelectionExtension(getCssRootZoomScale)),
    ...createRevealHighlightExtension(),
    EditorView.updateListener.of((update) => {
      const currentSelection = update.state.selection.main
      const selectionPayload = {
        filePath: props.filePath,
        hasSelection: currentSelection.from !== currentSelection.to,
        anchor: currentSelection.anchor,
        head: currentSelection.head,
        from: currentSelection.from,
        to: currentSelection.to,
        text:
          currentSelection.from !== currentSelection.to
            ? update.state.sliceDoc(currentSelection.from, currentSelection.to)
            : '',
      }

      if (update.selectionSet || update.docChanged) {
        emit('selection-change', selectionPayload)
        emitEditorRuntimeTelemetry({
          type: 'selection-change',
          runtimeKind: 'web',
          paneId: props.paneId,
          ...selectionPayload,
        })
      }
      if (update.selectionSet || update.docChanged) {
        const currentContent = update.state.doc.toString()
        void queueNativeRuntimeSync(async () => {
          const nativeDocument = editorRuntimeStore.nativeDocuments?.[props.filePath] || null
          if (update.docChanged) {
            await mirrorDocumentToNativeRuntime(currentContent)
          } else if (!nativeDocument) {
            await mirrorDocumentToNativeRuntime(currentContent)
          }

          return syncSelectionToNativeRuntime(selectionPayload, currentSelection.head)
        })
      }
      if (isMd && update.selectionSet) {
        scheduleMarkdownSelectionPreviewSync(currentSelection)
      }
    }),
  ]

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
          citPalette.cites = []
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
    const [{ autocompletion }, { createLatexCompletionSource }] = await Promise.all([
      import('@codemirror/autocomplete'),
      import('../../editor/latexAutocomplete'),
    ])
    extraExtensions.push(
      ...latexCitationsExtension(referencesStore, {
        isOpen: () => citPalette.show,
        onOpen: ({ x, y, query, triggerFrom, triggerTo, insideBrackets, latexCommand }) => {
          citPalette.show = true
          citPalette.mode = 'insert'
          citPalette.x = x
          citPalette.y = y
          citPalette.query = query
          citPalette.cites = []
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
        override: [
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

  const extensions = createEditorExtensions({
    softWrap: workspace.softWrap,
    wrapColumn: workspace.wrapColumn,
    languageExtension: langExt,
    autoSaveEnabled: workspace.autoSave && !isDraftFile,
    onDocChanged: handleDocumentChanged,
    onSave: (nextContent) => {
      void persistEditorContent(nextContent)
    },
    onCursorChange: (pos) => {
      emit('cursor-change', pos)
      emitEditorRuntimeTelemetry({
        type: 'cursor-change',
        runtimeKind: 'web',
        paneId: props.paneId,
        filePath: props.filePath,
        ...pos,
      })
    },
    onStats: (stats) => emit('editor-stats', stats),
    extraExtensions,
  })

  view = new EditorView({
    state: createEditorState(content, extensions),
    parent: editorContainer.value,
  })

  view.altalsPersist = async () => persistEditorContent(view?.state.doc.toString() || '')
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

  editorRuntimeHandle = createEditorRuntimeContract({
    runtimeKind: 'web',
    paneId: props.paneId,
    filePath: props.filePath,
    getView: () => view,
    getContent: () => view?.state?.doc?.toString?.() || '',
    persistContent: () => persistEditorContent(view?.state?.doc?.toString?.() || ''),
    applyExternalContent: (nextContent = '') => view?.altalsApplyExternalContent?.(nextContent),
    requestSelection: requestCurrentSelection,
    revealOffset: revealEditorOffset,
    revealRange: revealEditorRange,
    setDiagnostics: (diagnostics = []) => {
      latestDiagnostics = Array.isArray(diagnostics) ? diagnostics : []
      emitEditorRuntimeTelemetry({
        type: 'diagnostics-update',
        runtimeKind: 'web',
        paneId: props.paneId,
        filePath: props.filePath,
        diagnosticsCount: Array.isArray(diagnostics) ? diagnostics.length : 0,
      })
      void queueNativeRuntimeSync(() => syncDiagnosticsToNativeRuntime(latestDiagnostics))
      return true
    },
    setOutlineContext: (context = null) => {
      latestOutlineContext = context ?? null
      emitEditorRuntimeTelemetry({
        type: 'outline-context-update',
        runtimeKind: 'web',
        paneId: props.paneId,
        filePath: props.filePath,
        hasContext: !!context,
      })
      void queueNativeRuntimeSync(() => syncOutlineContextToNativeRuntime(latestOutlineContext))
      return true
    },
    dispose: destroyEditorView,
  })

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
      await appendLatexSyncDebug({
        event: 'backward-sync-received',
        detail: event.detail || null,
        normalizedFile,
        normalizedCurrentPath,
        location,
      })
      if (normalizedFile) {
        const targetFileName = normalizedFile.split('/').pop() || normalizedFile
        const currentFileName = normalizedCurrentPath.split('/').pop() || normalizedCurrentPath
        const exactMatch = normalizedFile === normalizedCurrentPath
        const fileNameOnlyMatch =
          !normalizedFile.includes('/') && targetFileName === currentFileName
        if (!exactMatch && !fileNameOnlyMatch) {
          if (editorStore.activeTab !== props.filePath) return
          await appendLatexSyncDebug({
            event: 'backward-sync-reveal-foreign',
            location,
          })
          await revealLatexSourceLocation(editorStore, location, {
            paneId: props.paneId,
            center: true,
          })
          return
        }
      }
      if (line && line > 0) {
        await appendLatexSyncDebug({
          event: 'backward-sync-reveal-current',
          location,
        })
        await revealLatexSourceLocation(editorStore, location, {
          paneId: props.paneId,
          center: true,
        })
      }
    }
  }

  if (!latexCursorRequestHandler) {
    latexCursorRequestHandler = (event) => {
      if (!view || event.detail?.texPath !== props.filePath) return
      const pos = view.state.selection.main.head
      const location = getLatexSyncLocation(pos)
      if (!location) return
      latexStore.requestForwardSync(props.filePath, location.line, location.column)
    }
  }
}

function ensureMarkdownWindowHandlers() {
  if (!isMd || markdownCursorRequestHandler) return

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
      runtimeKind: 'web',
      paneId: props.paneId,
      filePath: props.filePath,
      line: location.line,
      offset: location.offset,
      source: 'cursor-request',
    })
  }
}

function attachEditorRuntimeListeners() {
  editorContainer.value?.addEventListener('mousedown', handleContextMenuMouseDown, true)
  if (isMd && !isDraftFile) {
    editorContainer.value?.addEventListener('click', handleWikiLinkClick)
    editorContainer.value?.addEventListener('click', handleCitationClick)
  }
  if (supportsLatexRuntime) {
    editorContainer.value?.addEventListener('dblclick', handleLatexDoubleClick)
    editorContainer.value?.addEventListener('click', handleLatexCitationClick)
  }

  if (isMd && !isDraftFile) {
    ensureMarkdownWindowHandlers()
    window.addEventListener('markdown-request-cursor', markdownCursorRequestHandler)
  }
  if (supportsLatexRuntime) {
    ensureLatexWindowHandlers()
    window.addEventListener('latex-backward-sync', backwardSyncHandler)
    window.addEventListener('latex-request-cursor', latexCursorRequestHandler)
  }
}

function detachEditorRuntimeListeners() {
  editorContainer.value?.removeEventListener('mousedown', handleContextMenuMouseDown, true)
  if (isMd && !isDraftFile) {
    editorContainer.value?.removeEventListener('click', handleWikiLinkClick)
    editorContainer.value?.removeEventListener('click', handleCitationClick)
  }
  if (supportsLatexRuntime) {
    editorContainer.value?.removeEventListener('dblclick', handleLatexDoubleClick)
    editorContainer.value?.removeEventListener('click', handleLatexCitationClick)
  }
  if (markdownCursorRequestHandler) {
    window.removeEventListener('markdown-request-cursor', markdownCursorRequestHandler)
  }
  if (backwardSyncHandler) {
    window.removeEventListener('latex-backward-sync', backwardSyncHandler)
  }
  if (latexCursorRequestHandler) {
    window.removeEventListener('latex-request-cursor', latexCursorRequestHandler)
  }
}

function activateEditorRuntime() {
  if (!view || !editorRuntimeHandle || editorRuntimeActive) return
  editorRuntimeActive = true
  editorStore.registerEditorRuntime(props.paneId, props.filePath, editorRuntimeHandle)
  emitEditorRuntimeTelemetry({
    type: 'document-open',
    runtimeKind: 'web',
    paneId: props.paneId,
    filePath: props.filePath,
  })
  attachEditorRuntimeListeners()
  void queueNativeRuntimeSync(async () => {
    await mirrorDocumentToNativeRuntime(view.state.doc.toString())
    await syncSelectionToNativeRuntime()
    await syncDiagnosticsToNativeRuntime(latestDiagnostics)
    return syncOutlineContextToNativeRuntime(latestOutlineContext)
  })
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
  editorStore.unregisterEditorRuntime(props.paneId, props.filePath)
  emitEditorRuntimeTelemetry({
    type: 'document-close',
    runtimeKind: 'web',
    paneId: props.paneId,
    filePath: props.filePath,
  })
}

onActivated(() => {
  activateEditorRuntime()
})

onDeactivated(() => {
  deactivateEditorRuntime()
})

function handleWikiLinkClick(event) {
  if (!view) return

  const pos = view.posAtCoords(getZoomCompensatedClientPoint(event))
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
      const dir = props.filePath.split('/').slice(0, -1).join('/')
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

  const pos = view.posAtCoords(getZoomCompensatedClientPoint(event))
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

  const pos = view.posAtCoords(getZoomCompensatedClientPoint(event))
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
      runtimeKind: 'web',
      paneId: props.paneId,
      filePath: props.filePath,
      line: location.line,
      offset: location.offset,
      source: 'selection-sync',
    })
  }, 90)
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

function triggerLatexForwardSyncAtPos(pos) {
  if (!supportsLatexRuntime || !view) return
  if (!hasActiveLatexPdfPreviewTarget()) return
  const location = getLatexSyncLocation(pos)
  if (!location) return
  emitEditorRuntimeTelemetry({
    type: 'latex-forward-sync-request',
    runtimeKind: 'web',
    paneId: props.paneId,
    filePath: props.filePath,
    line: location.line,
    column: location.column,
  })
  latexStore.requestForwardSync(props.filePath, location.line, location.column)
}

function handleLatexDoubleClick(event) {
  if (!supportsLatexRuntime || !view || event.button !== 0) return
  const pos = view.posAtCoords(getZoomCompensatedClientPoint(event))
  if (pos === null) return
  triggerLatexForwardSyncAtPos(pos)
}

function getLatexSyncLocation(pos) {
  if (!view || !Number.isInteger(pos)) return null
  const line = view.state.doc.lineAt(pos)
  if (!line?.number || line.number < 1) return null
  return {
    line: line.number,
    column: Math.max(1, pos - line.from + 1),
  }
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
  () => workspace.softWrap,
  (wrap) => {
    if (!view) return
    view.dispatch({
      effects: wrapCompartment.reconfigure(wrap ? EditorView.lineWrapping : []),
    })
  }
)

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
  () => workspace.appZoomPercent,
  () => {
    if (!view) return
    requestAnimationFrame(() => {
      view?.requestMeasure?.()
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
  if (view) {
    destroyEditorView()
  }
  editorRuntimeHandle = null
  pendingContextMenuState = null
  clearContextMenuRestoreHandles()
  backwardSyncHandler = null
  latexCursorRequestHandler = null
  markdownCursorRequestHandler = null
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
