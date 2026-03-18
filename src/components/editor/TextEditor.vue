<template>
  <div class="typst-editor-shell h-full w-full" :class="{ 'cm-prose-file': isMd }" :data-editor-filepath="props.filePath">
    <div
      v-if="loadError"
      class="flex h-full items-center justify-center px-6 text-sm"
      style="color: var(--fg-muted);"
    >
      <div class="max-w-lg text-center space-y-2">
        <div>{{ loadError.message }}</div>
        <div v-if="loadError.detail" class="text-xs">{{ loadError.detail }}</div>
      </div>
    </div>
    <div v-else ref="editorContainer" class="min-h-0 flex-1 w-full overflow-hidden" @contextmenu.prevent="onContextMenu"></div>
  </div>
  <EditorContextMenu
    :visible="ctxMenu.show"
    :x="ctxMenu.x"
    :y="ctxMenu.y"
    :has-selection="ctxMenu.hasSelection"
    :file-path="props.filePath"
    :view="view"
    :spellcheck-enabled="isMd && workspace.spellcheck"
    :show-format-document="isTex || (isTyp && typstUi.tinymistActive)"
    :show-markdown-insert-table="isMd"
    :show-markdown-format-table="ctxMenu.showMarkdownFormatTable"
    :typst-code-actions="ctxMenu.typstCodeActions"
    @close="closeContextMenu"
    @apply-typst-code-action="handleApplyTypstCodeAction"
    @format-document="handleFormatDocument"
    @insert-markdown-table="handleInsertMarkdownTable"
    @format-markdown-table="handleFormatMarkdownTable"
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
import { ref, reactive, computed, onMounted, onUnmounted, onActivated, onDeactivated, watch } from 'vue'
import { Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { languages } from '@codemirror/language-data'
import { createEditorExtensions, createEditorState, wrapCompartment, columnWidthCompartment, columnWidthExtension } from '../../editor/setup'
import { ghostSuggestionExtension } from '../../editor/ghostSuggestion'
import { mergeViewExtension } from '../../editor/diffOverlay'
import { commentsExtension } from '../../editor/comments'
import { captureContextMenuState, normalizeContextMenuClickPos, resolveContextMenuSelection } from '../../editor/contextMenuPolicy'
import { useCommentsStore } from '../../stores/comments'
import { wikiLinksExtension } from '../../editor/wikiLinks'
import { livePreviewExtension } from '../../editor/livePreview'
import { citationsExtension } from '../../editor/citations'
import { createMarkdownDraftEditorExtensions } from '../../editor/markdownDraftAssist'
import {
  formatCurrentMarkdownTable,
  hasMarkdownTableAtCursor,
  insertMarkdownTable,
} from '../../editor/markdownTables'
import { supportsCitationInsertion } from '../../editor/citationSyntax'
import { resultProvenanceBadgesExtension } from '../../editor/resultProvenanceBadges'
import CitationPalette from './CitationPalette.vue'
import { autocompletion } from '@codemirror/autocomplete'
import { useFilesStore } from '../../stores/files'
import { useEditorStore } from '../../stores/editor'
import { useToastStore } from '../../stores/toast'
import { useWorkspaceStore } from '../../stores/workspace'
import { useReviewsStore } from '../../stores/reviews'
import { useLinksStore } from '../../stores/links'
import { useReferencesStore } from '../../stores/references'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { sendCode, runFile } from '../../services/codeRunner'
import { requestTinymistCodeActions, requestTinymistFormatting } from '../../services/tinymist/session'
import { applyTinymistTextEdits, applyTinymistTextEditsToText } from '../../services/tinymist/textEdits'
import { applyTinymistWorkspaceEdit } from '../../services/tinymist/workspaceEdit'
import {
  buildTinymistCodeActionContext,
  buildTinymistCodeActionRange,
  normalizeTinymistCodeActions,
} from '../../services/tinymist/codeActions'
import { useTypstStore } from '../../stores/typst'
import { isMarkdown, isLatex, isTypst, isRunnable, getLanguage, isRmdOrQmd, isBibFile } from '../../utils/fileTypes'
import { useLatexStore } from '../../stores/latex'
import { latexCitationsExtension } from '../../editor/latexCitations'
import { createLatexCompletionSource } from '../../editor/latexAutocomplete'
import { resolveLatexProjectGraph } from '../../services/latex/projectGraph'
import {
  supportsTinymistTypstEditor as supportsTypstEditorSupport,
  createTinymistTypstEditorExtensions as createTypstEditorSupport,
} from '../../services/tinymist/editor'
import { createTypstDiagnosticsExtension } from '../../editor/typstEditorIntegration'
import EditorContextMenu from './EditorContextMenu.vue'
import { useTextEditorCitations } from '../../composables/useTextEditorCitations'
import { useTypstDiagnostics } from '../../composables/useTypstDiagnostics'
import { useTypstEditorNavigation } from '../../composables/useTypstEditorNavigation'
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
const reviews = useReviewsStore()
const linksStore = useLinksStore()
const referencesStore = useReferencesStore()
const toastStore = useToastStore()
const typstStore = useTypstStore()
const latexStore = useLatexStore()
const commentsStore = useCommentsStore()
const { t } = useI18n()
const loadError = computed(() => files.getFileLoadError(props.filePath))

let view = null
let rmdKernelBridge = null
let chunkExecuteHandler = null
let chunkExecuteAllHandler = null
let syncChunkProvenance = null
let backwardSyncHandler = null
let latexCursorRequestHandler = null
let cleanupTypstWindowListeners = null
let editorRuntimeActive = false
let pendingContextMenuState = null
let contextMenuRestoreFrame = null
let contextMenuRestoreTimeout = null
let latexNormalizedSaveContent = null
let latexFormatOnSaveInFlight = false
let typstNormalizedSaveContent = null
let typstFormatOnSaveInFlight = false

const isMd = isMarkdown(props.filePath)
const isTex = isLatex(props.filePath)
const isBib = isBibFile(props.filePath)
const isTyp = isTypst(props.filePath)
const supportsCitations = supportsCitationInsertion(props.filePath)
const supportsTypstSupport = supportsTypstEditorSupport(props.filePath)
const fileIsRunnable = isRunnable(props.filePath)
const fileLanguage = getLanguage(props.filePath)
const fileIsRmdOrQmd = isRmdOrQmd(props.filePath)
const isMacPlatform = typeof navigator !== 'undefined'
  && /mac/i.test(navigator.userAgentData?.platform || navigator.platform || '')

const ctxMenu = reactive({
  show: false,
  x: 0,
  y: 0,
  hasSelection: false,
  showMarkdownFormatTable: false,
  typstCodeActions: [],
  requestId: 0,
})

const getView = () => view

const {
  citPalette,
  openCitationPaletteAtSelection,
  onCitInsert,
  onCitUpdate,
  onCitClose,
  handleCitationClick,
  handleLatexCitationClick,
  handleTypstCitationClick,
  createMarkdownCitationHandlers,
  createLatexCitationHandlers,
} = useTextEditorCitations({
  filePath: props.filePath,
  getView,
  isLatexFile: isTex,
  isTypstFile: isTyp,
  t,
  toastStore,
})

const {
  typstUi,
  connectTinymistDocument,
  disconnectTinymistDocument,
  focusEditorLine,
  handleEditorSelectionChange,
  hydrateTypstDiagnostics,
  registerWindowListeners: registerTypstWindowListeners,
  scheduleTinymistSync,
} = useTypstDiagnostics({
  filePath: props.filePath,
  getView,
  typstStore,
  editorStore,
  filesStore: files,
  referencesStore,
  getWorkspacePath: () => workspace.path,
  t,
})

const {
  buildDefinitionKeymap,
  handleDefinitionClick,
  handleNavigationSelectionChange,
  tinymistNavUi,
} = useTypstEditorNavigation({
  filePath: props.filePath,
  getView,
  editorStore,
  filesStore: files,
  workspacePath: workspace.path,
  toastStore,
  isTinymistAvailable: () => typstUi.tinymistActive,
  t,
})

const {
  handleCommentClick,
  syncCommentsToEditor,
  pushCommentPositionsToStore,
  showMergeViewIfNeeded,
} = useTextEditorBridges({
  filePath: props.filePath,
  editorContainer,
  getView,
  files,
  reviews,
  commentsStore,
  isMarkdownFile: isMd,
  isLatexFile: isTex,
  t,
  toastStore,
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

  const approxPos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false)
  if (approxPos === null) return null

  const block = view.lineBlockAtHeight(event.clientY - view.documentTop)
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

  pendingContextMenuState = captureContextMenuState(
    view.state,
    resolveContextMenuClickPos(event),
  )

  // Block browser and CodeMirror mouse-selection handling for context-menu gestures.
  // We restore the intended caret/selection from the captured snapshot in onContextMenu.
  event.preventDefault()
  event.stopPropagation()
}

function onContextMenu(e) {
  ctxMenu.x = e.clientX
  ctxMenu.y = e.clientY

  if (view) {
    view.focus()
    const decision = resolveContextMenuSelection(
      pendingContextMenuState || captureContextMenuState(
        view.state,
        resolveContextMenuClickPos(e),
      ),
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
  ctxMenu.typstCodeActions = []
  ctxMenu.requestId += 1
  void loadTypstContextMenuCodeActions()
}

function closeContextMenu() {
  ctxMenu.show = false
  ctxMenu.showMarkdownFormatTable = false
  ctxMenu.typstCodeActions = []
  ctxMenu.requestId += 1
}

function buildTypstCodeActionRequest() {
  if (!isTyp || !view || !typstUi.tinymistActive) return null

  const range = buildTinymistCodeActionRange(view.state, view.state.selection.main)
  if (!range) return null

  const rawDiagnostics = typstStore.liveStateForFile(props.filePath)?.diagnostics || []
  const context = buildTinymistCodeActionContext(rawDiagnostics, range)
  return { range, context }
}

async function loadTypstContextMenuCodeActions() {
  const request = buildTypstCodeActionRequest()
  if (!ctxMenu.show || !request) {
    ctxMenu.typstCodeActions = []
    return
  }

  const requestId = ctxMenu.requestId

  try {
    const result = await requestTinymistCodeActions(props.filePath, request.range, request.context)
    if (!ctxMenu.show || requestId !== ctxMenu.requestId) return

    ctxMenu.typstCodeActions = normalizeTinymistCodeActions(result)
      .slice(0, 5)
  } catch {
    if (!ctxMenu.show || requestId !== ctxMenu.requestId) return
    ctxMenu.typstCodeActions = []
  }
}

async function handleApplyTypstCodeAction(action) {
  if (!action?.edit) {
    toastStore.show(
      t('No code actions could be applied at the current cursor location.'),
      { type: 'warning', duration: 3200 },
    )
    return
  }

  try {
    const applied = await applyTinymistWorkspaceEdit(action.edit, {
      filesStore: files,
      editorStore,
    })

    if (applied.totalFiles === 0) {
      toastStore.show(
        t('No code actions could be applied at the current cursor location.'),
        { type: 'warning', duration: 3200 },
      )
      return
    }

    if (view && applied.appliedFiles.includes(props.filePath)) {
      scheduleTinymistSync(view.state.doc.toString())
    }

    if (applied.skippedFiles.length > 0) {
      toastStore.show(
        t('Applied code action to {count} file(s), but skipped {skipped}.', {
          count: applied.appliedFiles.length,
          skipped: applied.skippedFiles.map((value) => value.split('/').pop() || value).join(', '),
        }),
        { type: 'warning', duration: 5000 },
      )
      return
    }

    toastStore.show(
      t('Applied code action to {count} file(s).', {
        count: applied.appliedFiles.length,
      }),
      { type: 'success', duration: 2600 },
    )
  } catch (error) {
    toastStore.showOnce('tinymist-code-action-failed', t('Typst code action failed: {error}', {
      error: error?.message || String(error || ''),
    }), {
      type: 'error',
      duration: 5000,
    }, 3000)
  }
}

async function handleFormatDocument() {
  if (!view || (!isTyp && !isTex)) return

  if (isTyp) {
    if (!typstUi.tinymistActive) {
      toastStore.showOnce('tinymist-format-unavailable', t('Tinymist is not available for formatting.'), {
        type: 'error',
        duration: 4000,
      }, 5000)
      return
    }

    try {
      const edits = await requestTinymistFormatting(props.filePath, {
        tabSize: 2,
        insertSpaces: true,
      })
      if (!Array.isArray(edits) || edits.length === 0) return
      applyTinymistTextEdits(view, edits)
    } catch (error) {
      toastStore.showOnce('tinymist-format-failed', t('Typst formatting failed: {error}', {
        error: error?.message || String(error || ''),
      }), {
        type: 'error',
        duration: 5000,
      }, 3000)
    }
    return
  }

  if (!latexStore.hasLatexFormatter) {
    void latexStore.checkTools().catch(() => {})
    toastStore.showOnce('latex-format-unavailable', t('LaTeX formatter is not available.'), {
      type: 'error',
      duration: 4000,
    }, 5000)
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
    toastStore.showOnce('latex-format-failed', t('LaTeX formatting failed: {error}', {
      error: error?.message || String(error || ''),
    }), {
      type: 'error',
      duration: 5000,
    }, 3000)
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

async function requestFormattedTypstContent(content, options = {}) {
  if (!typstUi.tinymistActive) {
    if (options.notifyUnavailable) {
      toastStore.showOnce('tinymist-format-unavailable', t('Tinymist is not available for formatting.'), {
        type: 'error',
        duration: 4000,
      }, 5000)
    }
    return content
  }

  const edits = await requestTinymistFormatting(props.filePath, {
    tabSize: 2,
    insertSpaces: true,
  })
  if (!Array.isArray(edits) || edits.length === 0) return content
  return applyTinymistTextEditsToText(content, edits)
}

async function persistEditorContent(content) {
  if (isTex) {
    if (latexNormalizedSaveContent != null && content === latexNormalizedSaveContent) {
      latexNormalizedSaveContent = null
      return
    }

    let nextContent = content
    if (latexStore.formatOnSave && latexStore.hasLatexFormatter && !latexFormatOnSaveInFlight) {
      try {
        latexFormatOnSaveInFlight = true
        const formatted = await latexStore.formatDocument(props.filePath, content)
        if (typeof formatted === 'string' && formatted !== content) {
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
        toastStore.showOnce('latex-format-on-save-failed', t('LaTeX format on save failed: {error}', {
          error: error?.message || String(error || ''),
        }), {
          type: 'error',
          duration: 5000,
        }, 3000)
      } finally {
        latexFormatOnSaveInFlight = false
      }
    }

    await files.saveFile(props.filePath, nextContent)
    void latexStore.scheduleAutoBuildForPath(props.filePath, {
      sourceContent: nextContent,
    })
    return
  }

  if (isTyp) {
    if (typstNormalizedSaveContent != null && content === typstNormalizedSaveContent) {
      typstNormalizedSaveContent = null
      return
    }

    let nextContent = content
    if (typstStore.formatOnSave && !typstFormatOnSaveInFlight) {
      try {
        typstFormatOnSaveInFlight = true
        const formatted = await requestFormattedTypstContent(content)
        if (typeof formatted === 'string' && formatted !== content) {
          nextContent = formatted
          typstNormalizedSaveContent = formatted
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
        toastStore.showOnce('typst-format-on-save-failed', t('Typst format on save failed: {error}', {
          error: error?.message || String(error || ''),
        }), {
          type: 'error',
          duration: 5000,
        }, 3000)
      } finally {
        typstFormatOnSaveInFlight = false
      }
    }

    await files.saveFile(props.filePath, nextContent)
    void typstStore.scheduleAutoBuildForPath(props.filePath, {
      sourceContent: nextContent,
    })
    return
  }

  await files.saveFile(props.filePath, content)

  if (isBib) {
    void latexStore.scheduleAutoBuildForPath(props.filePath)
  }
}

async function loadLanguageExtension() {
  if (isMd) {
    const { markdown, markdownLanguage } = await import('@codemirror/lang-markdown')
    return markdown({ base: markdownLanguage, codeLanguages: languages })
  }
  if (isTyp) {
    // Typst support is provided by our dedicated editor bundle instead of
    // the generic language-data registry fallback.
    return null
  }
  // Try to match by filename from the language-data registry
  const matched = languages.filter((lang) => {
    // LanguageDescription has filename patterns and extensions
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
    const loaded = await matched[0].load()
    return loaded
  }
  return null
}

onMounted(async () => {
  if (!editorContainer.value) return

  // Load file content
  let content = files.fileContents[props.filePath]
  if (content === undefined) {
    content = await files.readFile(props.filePath)
  }
  if (content === null && loadError.value) {
    return
  }
  if (content === null) content = ''
  if (isTex) {
    void latexStore.checkTools().catch(() => {})
    void latexStore.refreshLint(props.filePath, {
      sourceContent: content,
    }).catch(() => {})
    void resolveLatexProjectGraph(props.filePath, {
      filesStore: files,
      referencesStore,
      workspacePath: workspace.path,
    })
  }

  // Load language
  const langExt = await loadLanguageExtension()

  // Build extra extensions
  const extraExtensions = [
    ...resultProvenanceBadgesExtension(),
    // Ghost suggestions (all file types)
    ghostSuggestionExtension(
      () => workspace,
      () => workspace.systemPrompt,
      { isEnabled: () => workspace.ghostEnabled, getInstructions: () => workspace.instructions },
    ),
    // Merge view for inline diffs (always available)
    mergeViewExtension(),
    // Comments (always available)
    ...commentsExtension(),
    // Track doc changes for comment position mapping, and selection changes
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        pushCommentPositionsToStore(update.view)
      }
      if (update.selectionSet || update.docChanged) {
        const sel = update.state.selection.main
        emit('selection-change', sel.from !== sel.to)
      }
      if (isTyp && update.docChanged) {
        scheduleTinymistSync(update.state.doc.toString())
        if (!tinymistNavUi.jumpInFlight) {
          handleNavigationSelectionChange()
        }
      }
      if (fileIsRmdOrQmd && update.docChanged) {
        syncChunkProvenance?.(update.view)
      }
      if (isTyp && update.selectionSet && !typstUi.jumpInFlight && !tinymistNavUi.jumpInFlight) {
        handleEditorSelectionChange(update.state.selection.main.head)
        handleNavigationSelectionChange()
      }
    }),
  ]

  if (isTyp) {
    extraExtensions.push(...createTypstDiagnosticsExtension())
  }

  if (supportsCitations) {
    extraExtensions.push(Prec.highest(keymap.of([
      {
        key: 'Mod-Shift-c',
        run: (editorView) => openCitationPaletteAtSelection(editorView),
      },
    ])))
  }

  // Code runner keybindings for runnable files
  if (fileIsRunnable) {
    if (fileIsRmdOrQmd) {
      // .Rmd/.qmd: chunk-aware execution with inline outputs
      const { chunkField: cf, chunkAtPosition, extractAllChunkCode } = await import('../../editor/codeChunks')
      const { chunkOutputsExtension, setChunkOutput, chunkKey: getChunkKey, chunkOutputField } = await import('../../editor/chunkOutputs')
      const { ChunkKernelBridge } = await import('../../services/chunkKernelBridge')
      const {
        buildChunkProvenance,
        buildSourceSignature,
        classifyExecutionFailure,
        markLiveProvenanceStatus,
        registerLiveProvenance,
      } = await import('../../services/resultProvenance')

      // Load inline output widgets
      extraExtensions.push(...chunkOutputsExtension())

      // Jupyter kernel bridge — no subprocess fallback
      const kernelBridge = new ChunkKernelBridge(workspace.path)
      rmdKernelBridge = kernelBridge

      syncChunkProvenance = (editorView) => {
        const chunks = editorView.state.field(cf)
        const outputMap = editorView.state.field(chunkOutputField)
        for (const chunk of chunks) {
          const key = getChunkKey(chunk, editorView.state.doc)
          const entry = outputMap.get(key)
          if (!entry?.provenance || entry.status === 'running') continue
          const source = editorView.state.sliceDoc(chunk.contentFrom, chunk.contentTo).trim()
          const currentSignature = buildSourceSignature(source)
          if (entry.sourceSignature && entry.sourceSignature !== currentSignature) {
            markLiveProvenanceStatus(entry.provenance, 'stale')
          } else {
            registerLiveProvenance({
              ...entry.provenance,
              status: entry.status,
            })
          }
        }
      }

      /**
       * Execute a chunk inline via Jupyter kernel.
       * Shows setup error if no kernel is available.
       */
      async function executeChunk(editorView, chunk) {
        const code = editorView.state.sliceDoc(chunk.contentFrom, chunk.contentTo).trim()
        if (!code) return

        const key = getChunkKey(chunk, editorView.state.doc)
        const sourceSignature = buildSourceSignature(code)

        editorView.dispatch({
          effects: setChunkOutput.of({
            chunkKey: key,
            outputs: [],
            status: 'running',
            sourceSignature,
          }),
        })

        const result = await kernelBridge.execute(code, chunk.language)
        const failure = result.success === false
          ? classifyExecutionFailure(
            (result.outputs || [])
              .filter((output) => output.output_type === 'error')
              .map((output) => `${output.ename}: ${output.evalue}`)
              .join('\n'),
            result.outputs,
          )
          : null
        const provenance = buildChunkProvenance({
          filePath: props.filePath,
          chunkKey: key,
          language: chunk.language,
          source: code,
          outputs: result.outputs,
          status: result.success ? 'fresh' : 'error',
          errorHint: failure?.hintKey ? t(failure.hintKey) : '',
        })
        registerLiveProvenance(provenance)
        editorView.dispatch({
          effects: setChunkOutput.of({
            chunkKey: key,
            outputs: result.outputs,
            status: result.success ? 'fresh' : 'error',
            sourceSignature,
            provenance,
            hint: failure?.hintKey ? t(failure.hintKey) : '',
          }),
        })
        syncChunkProvenance?.(editorView)
      }

      extraExtensions.push(Prec.highest(keymap.of([
        {
          key: 'Mod-Enter',
          run: (editorView) => {
            const state = editorView.state
            const sel = state.selection.main
            const chunks = state.field(cf)
            const chunk = chunkAtPosition(chunks, state.doc, sel.head)
            if (!chunk) return true // In prose/YAML → do nothing

            if (sel.from !== sel.to) {
              // Selection → run only selected text, show output under this chunk
              const selCode = state.sliceDoc(sel.from, sel.to).trim()
              if (selCode) {
                const key = getChunkKey(chunk, state.doc)
                const sourceSignature = buildSourceSignature(selCode)
                editorView.dispatch({
                  effects: setChunkOutput.of({ chunkKey: key, outputs: [], status: 'running', sourceSignature }),
                })
                kernelBridge.execute(selCode, chunk.language).then(result => {
                  const failure = result.success === false
                    ? classifyExecutionFailure(
                      (result.outputs || [])
                        .filter((output) => output.output_type === 'error')
                        .map((output) => `${output.ename}: ${output.evalue}`)
                        .join('\n'),
                      result.outputs,
                    )
                    : null
                  const provenance = buildChunkProvenance({
                    filePath: props.filePath,
                    chunkKey: key,
                    language: chunk.language,
                    source: selCode,
                    outputs: result.outputs,
                    status: result.success ? 'fresh' : 'error',
                    errorHint: failure?.hintKey ? t(failure.hintKey) : '',
                  })
                  registerLiveProvenance(provenance)
                  editorView.dispatch({
                    effects: setChunkOutput.of({
                      chunkKey: key,
                      outputs: result.outputs,
                      status: result.success ? 'fresh' : 'error',
                      sourceSignature,
                      provenance,
                      hint: failure?.hintKey ? t(failure.hintKey) : '',
                    }),
                  })
                  syncChunkProvenance?.(editorView)
                })
              }
              return true
            }

            executeChunk(editorView, chunk)

            // Advance cursor to next chunk header
            const idx = chunks.indexOf(chunk)
            if (idx >= 0 && idx + 1 < chunks.length) {
              const nextChunk = chunks[idx + 1]
              const nextLine = state.doc.line(nextChunk.headerLine)
              editorView.dispatch({
                selection: { anchor: nextLine.from },
                scrollIntoView: true,
              })
            }
            return true
          },
        },
        {
          key: 'Shift-Mod-Enter',
          run: (editorView) => {
            const totalChunks = editorView.state.field(cf).length

            // Run all chunks sequentially, re-reading live state each iteration
            ;(async () => {
              for (let i = 0; i < totalChunks; i++) {
                const chunks = editorView.state.field(cf)
                const chunk = chunks[i]
                if (!chunk || !chunk.endLine) continue
                const code = editorView.state.sliceDoc(chunk.contentFrom, chunk.contentTo).trim()
                if (!code) continue
                await executeChunk(editorView, chunk)
              }
            })()
            return true
          },
        },
      ])))

      // Listen for chunk-execute events from gutter play buttons
      chunkExecuteHandler = (event) => {
        if (!view) return
        const { chunkIdx } = event.detail || {}
        const chunks = view.state.field(cf)
        if (chunkIdx >= 0 && chunkIdx < chunks.length) {
          executeChunk(view, chunks[chunkIdx])
        }
      }

      // Listen for chunk-execute-all (Run All button) — sequential execution
      // Re-reads chunks on each iteration so offsets stay fresh after output widgets shift lines
      chunkExecuteAllHandler = async (event) => {
        if (!view) return
        const totalChunks = view.state.field(cf).length
        for (let i = 0; i < totalChunks; i++) {
          const chunks = view.state.field(cf)
          const chunk = chunks[i]
          if (!chunk || !chunk.endLine) continue
          const code = view.state.sliceDoc(chunk.contentFrom, chunk.contentTo).trim()
          if (!code) continue
          await executeChunk(view, chunk)
        }
      }
    } else {
      // Plain .r/.py/.jl: line-by-line execution
      extraExtensions.push(Prec.highest(keymap.of([
        {
          key: 'Mod-Enter',
          run: (editorView) => {
            const state = editorView.state
            const sel = state.selection.main
            let code
            if (sel.from !== sel.to) {
              code = state.sliceDoc(sel.from, sel.to)
            } else {
              const line = state.doc.lineAt(sel.head)
              code = line.text
              if (line.number < state.doc.lines) {
                const nextLine = state.doc.line(line.number + 1)
                editorView.dispatch({
                  selection: { anchor: nextLine.from },
                  scrollIntoView: true,
                })
              }
            }
            if (code) sendCode(code, fileLanguage)
            return true
          },
        },
        {
          key: 'Shift-Mod-Enter',
          run: () => {
            runFile(props.filePath, fileLanguage)
            return true
          },
        },
      ])))
    }
  }

  // Code chunk gutter play buttons for .Rmd/.qmd files
  if (fileIsRmdOrQmd) {
    const { codeChunksExtension } = await import('../../editor/codeChunks')
    extraExtensions.push(...codeChunksExtension())
  }

  // Markdown-only extensions
  if (isMd) {
    const completionSources = []

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

    const citations = citationsExtension(referencesStore, {
      isOpen: () => citPalette.show,
      ...createMarkdownCitationHandlers(),
    })
    extraExtensions.push(...citations.extensions)

    // Single autocompletion instance with wiki links only (citations use palette now)
    extraExtensions.push(autocompletion({
      override: completionSources,
      activateOnTyping: true,
      activateOnTypingDelay: 0,
      defaultKeymap: true,
    }))

    // Formatting shortcuts (Cmd+B, Cmd+I, etc.)
    const { markdownShortcuts } = await import('../../editor/markdownShortcuts')
    extraExtensions.push(markdownShortcuts())

    // Live preview (hide markdown syntax when cursor is elsewhere)
    extraExtensions.push(...livePreviewExtension(() => workspace.livePreviewEnabled, () => props.filePath))
    extraExtensions.push(...createMarkdownDraftEditorExtensions({
      referencesStore,
      t,
    }))
  }

  // LaTeX-only extensions
  if (isTex) {
    const completionSources = []

    const latexCitations = latexCitationsExtension(referencesStore, {
      isOpen: () => citPalette.show,
      ...createLatexCitationHandlers(),
    })
    extraExtensions.push(...latexCitations.extensions)

    completionSources.push(createLatexCompletionSource({
      filePath: props.filePath,
      filesStore: files,
      referencesStore,
      workspacePath: workspace.path,
    }))

    extraExtensions.push(autocompletion({
      override: completionSources,
      activateOnTyping: true,
      activateOnTypingDelay: 0,
      defaultKeymap: true,
    }))

    extraExtensions.push(Prec.highest(keymap.of([
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
    ])))
  }

  // Typst-only extensions
  if (supportsTypstSupport) {
    extraExtensions.push(...createTypstEditorSupport({
      filePath: props.filePath,
      filesStore: files,
      getReferenceByKey: (key) => referencesStore.getByKey(key),
      isEnabled: () => typstStore.inlayHints,
      openFile: (path) => editorStore.openFile(path),
      referencesStore,
      toastStore,
      t,
      workspacePath: workspace.path,
    }))
    extraExtensions.push(Prec.highest(keymap.of([
      ...buildDefinitionKeymap(),
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
    ])))
  }

  const extensions = createEditorExtensions({
    softWrap: workspace.softWrap,
    wrapColumn: workspace.wrapColumn,
    languageExtension: langExt,
    onSave: (content) => {
      void persistEditorContent(content)
    },
    onCursorChange: (pos) => {
      emit('cursor-change', pos)
    },
    onStats: (stats) => {
      emit('editor-stats', stats)
    },
    extraExtensions,
  })

  const state = createEditorState(content, extensions)

  view = new EditorView({
    state,
    parent: editorContainer.value,
  })

  activateEditorRuntime()
})

function ensureLatexWindowHandlers() {
  if (!isTex) return
  if (!backwardSyncHandler) {
    backwardSyncHandler = (event) => {
      const { file, line } = event.detail || {}
      if (file && !props.filePath.endsWith(file.split('/').pop())) return
      if (line && line > 0) {
        focusEditorLine(line, { center: true })
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

function attachEditorRuntimeListeners() {
  editorContainer.value?.addEventListener('mousedown', handleContextMenuMouseDown, true)
  if (isMd) {
    editorContainer.value?.addEventListener('click', handleWikiLinkClick)
    editorContainer.value?.addEventListener('click', handleCitationClick)
  }
  if (isTex) {
    editorContainer.value?.addEventListener('click', handleLatexCitationClick)
    editorContainer.value?.addEventListener('dblclick', handleLatexSourceDoubleClick)
  }
  if (isTyp) {
    editorContainer.value?.addEventListener('click', handleDefinitionClick)
    editorContainer.value?.addEventListener('click', handleTypstCitationClick)
  }
  editorContainer.value?.addEventListener('comment-click', handleCommentClick)
  if (chunkExecuteHandler) {
    editorContainer.value?.addEventListener('chunk-execute', chunkExecuteHandler)
    editorContainer.value?.addEventListener('chunk-execute-all', chunkExecuteAllHandler)
  }
  if (isTyp && !cleanupTypstWindowListeners) {
    cleanupTypstWindowListeners = registerTypstWindowListeners(isTyp)
  }
  if (isTex) {
    ensureLatexWindowHandlers()
    window.addEventListener('latex-backward-sync', backwardSyncHandler)
    window.addEventListener('latex-request-cursor', latexCursorRequestHandler)
  }
}

function detachEditorRuntimeListeners() {
  editorContainer.value?.removeEventListener('mousedown', handleContextMenuMouseDown, true)
  if (isMd) {
    editorContainer.value?.removeEventListener('click', handleWikiLinkClick)
    editorContainer.value?.removeEventListener('click', handleCitationClick)
  }
  if (isTex) {
    editorContainer.value?.removeEventListener('click', handleLatexCitationClick)
    editorContainer.value?.removeEventListener('dblclick', handleLatexSourceDoubleClick)
  }
  if (isTyp) {
    editorContainer.value?.removeEventListener('click', handleDefinitionClick)
    editorContainer.value?.removeEventListener('click', handleTypstCitationClick)
  }
  editorContainer.value?.removeEventListener('comment-click', handleCommentClick)
  if (chunkExecuteHandler) {
    editorContainer.value?.removeEventListener('chunk-execute', chunkExecuteHandler)
    editorContainer.value?.removeEventListener('chunk-execute-all', chunkExecuteAllHandler)
  }
  if (cleanupTypstWindowListeners) {
    cleanupTypstWindowListeners()
    cleanupTypstWindowListeners = null
  }
  if (backwardSyncHandler) {
    window.removeEventListener('latex-backward-sync', backwardSyncHandler)
  }
  if (latexCursorRequestHandler) {
    window.removeEventListener('latex-request-cursor', latexCursorRequestHandler)
  }
}

function activateEditorRuntime() {
  if (!view || editorRuntimeActive) return
  editorRuntimeActive = true
  editorStore.registerEditorView(props.paneId, props.filePath, view)
  attachEditorRuntimeListeners()
  showMergeViewIfNeeded()
  syncCommentsToEditor(view)
  if (isTyp) {
    hydrateTypstDiagnostics()
    void connectTinymistDocument(view.state.doc.toString())
  }
  requestAnimationFrame(() => {
    view?.requestMeasure?.()
  })
}

function deactivateEditorRuntime() {
  if (!editorRuntimeActive) return
  editorRuntimeActive = false
  ctxMenu.show = false
  citPalette.show = false
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

// Wiki link click navigation (plain click navigates, like Obsidian)
function handleWikiLinkClick(event) {
  if (!view) return

  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
  if (pos === null) return

  const line = view.state.doc.lineAt(pos)
  const lineText = line.text

  const re = /\[\[([^\]]+)\]\]/g
  let match
  while ((match = re.exec(lineText)) !== null) {
    const mFrom = line.from + match.index
    const mTo = mFrom + match[0].length
    if (pos >= mFrom && pos < mTo) {
      let target = match[1]
      let heading = null

      const pipeIdx = target.indexOf('|')
      if (pipeIdx !== -1) target = target.substring(0, pipeIdx)

      const hashIdx = target.indexOf('#')
      if (hashIdx !== -1) {
        heading = target.substring(hashIdx + 1)
        target = target.substring(0, hashIdx)
      }
      target = target.trim()
      if (!target) return

      const resolved = linksStore.resolveLink(target, props.filePath)
      if (resolved) {
        editorStore.openFile(resolved.path)
      } else {
        // Create new file in same directory
        const dir = props.filePath.split('/').slice(0, -1).join('/')
        const newName = target.endsWith('.md') ? target : target + '.md'
        files.createFile(dir, newName).then(newPath => {
          if (newPath) editorStore.openFile(newPath)
        })
      }
      event.preventDefault()
      event.stopPropagation()
      return
    }
  }
}

function handleLatexSourceDoubleClick(event) {
  if (!isTex || !view || event.button !== 0) return

  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
  if (pos === null) return

  const location = getLatexSyncLocation(pos)
  if (!location) return

  workflowStore.ensurePreviewForSource(props.filePath, {
    previewKind: 'pdf',
    activatePreview: false,
    sourcePaneId: props.paneId,
    trigger: 'latex-source-dblclick',
  })
  latexStore.requestForwardSync(props.filePath, location.line, location.column)
}

function getLatexSyncLocation(pos) {
  if (!view || !Number.isInteger(pos)) return null
  const line = view.state.doc.lineAt(pos)
  if (!line?.number || line.number < 1) return null
  return {
    line: line.number,
    // SyncTeX accepts 1-based columns; use 0 only when unavailable.
    column: Math.max(1, pos - line.from + 1),
  }
}

// Watch for soft wrap toggle
watch(
  () => workspace.softWrap,
  (wrap) => {
    if (!view) return
    view.dispatch({
      effects: wrapCompartment.reconfigure(wrap ? EditorView.lineWrapping : []),
    })
  }
)

// Watch for wrap column change
watch(
  () => workspace.wrapColumn,
  (col) => {
    if (!view) return
    view.dispatch({
      effects: columnWidthCompartment.reconfigure(columnWidthExtension(col)),
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

// Watch for live preview toggle — nudge CM to rebuild decorations
if (isMd) {
  watch(
    () => workspace.livePreviewEnabled,
    () => {
      if (!view) return
      // Move selection to same position to trigger selectionSet → decoration rebuild
      const pos = view.state.selection.main.head
      view.dispatch({ selection: { anchor: pos } })
    }
  )
}

onUnmounted(() => {
  deactivateEditorRuntime()
  if (isTyp) {
    void disconnectTinymistDocument()
  }
  if (rmdKernelBridge) {
    rmdKernelBridge.shutdown()
    rmdKernelBridge = null
  }
  if (view) {
    view.destroy()
    view = null
  }
  pendingContextMenuState = null
  clearContextMenuRestoreHandles()
  backwardSyncHandler = null
  latexCursorRequestHandler = null
})
</script>

<style scoped>
.typst-editor-shell {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--bg-primary);
}

.typst-diagnostics-banner {
  flex-shrink: 0;
  border-bottom: 1px solid rgba(239, 68, 68, 0.22);
  background:
    linear-gradient(180deg, rgba(120, 20, 20, 0.2), rgba(120, 20, 20, 0.08)),
    var(--bg-secondary);
}

.typst-diagnostics-banner-warning {
  border-bottom-color: rgba(245, 158, 11, 0.22);
  background:
    linear-gradient(180deg, rgba(120, 82, 18, 0.2), rgba(120, 82, 18, 0.08)),
    var(--bg-secondary);
}

.typst-diagnostics-banner-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
}

.typst-diagnostics-banner-copy {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.typst-diagnostics-pill {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.15);
  color: #fecaca;
  font-size: var(--ui-font-label);
  font-weight: 700;
}

.typst-diagnostics-pill-warning {
  background: rgba(245, 158, 11, 0.16);
  color: #fde68a;
}

.typst-diagnostics-message {
  min-width: 0;
  color: var(--fg-primary);
  font-size: var(--ui-font-body);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.typst-diagnostics-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.typst-diagnostics-btn {
  border: 0;
  background: transparent;
  color: var(--fg-muted);
  cursor: pointer;
  font-size: var(--ui-font-label);
  line-height: 1.2;
}

.typst-diagnostics-btn:hover {
  color: var(--fg-primary);
}

.typst-diagnostics-btn-accent {
  color: var(--accent);
}

.typst-diagnostics-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 180px;
  overflow-y: auto;
  padding: 0 8px 8px;
}

.typst-diagnostic-item {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
  width: 100%;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--fg-secondary);
  cursor: pointer;
  padding: 7px 8px;
  text-align: left;
}

.typst-diagnostic-item:hover,
.typst-diagnostic-item-active {
  background: rgba(255, 255, 255, 0.045);
  color: var(--fg-primary);
}

.typst-diagnostic-item-warning .typst-diagnostic-item-line {
  color: #fcd34d;
}

.typst-diagnostic-item-line {
  color: var(--fg-muted);
  font-size: var(--ui-font-caption);
}

.typst-diagnostic-item-message {
  min-width: 0;
  font-size: var(--ui-font-label);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
