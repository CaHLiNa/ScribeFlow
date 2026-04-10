<template>
  <div
    class="typst-editor-shell h-full w-full"
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
import {
  createRevealHighlightExtension,
  focusEditorLineWithHighlight,
} from '../../editor/revealHighlight'
import {
  captureContextMenuState,
  normalizeContextMenuClickPos,
  resolveContextMenuSelection,
} from '../../editor/contextMenuPolicy'
import { wikiLinksExtension } from '../../editor/wikiLinks'
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
import { useTypstStore } from '../../stores/typst'
import { useLatexStore } from '../../stores/latex'
import {
  requestTinymistCodeActions,
  requestTinymistFormatting,
} from '../../services/tinymist/session'
import {
  applyTinymistTextEdits,
  applyTinymistTextEditsToText,
} from '../../services/tinymist/textEdits'
import { applyTinymistWorkspaceEdit } from '../../services/tinymist/workspaceEdit'
import {
  buildTinymistCodeActionContext,
  buildTinymistCodeActionRange,
  normalizeTinymistCodeActions,
} from '../../services/tinymist/codeActions'
import { isMarkdown, isLatex, isTypst } from '../../utils/fileTypes'
import { resolveLatexProjectGraph } from '../../services/latex/projectGraph'
import {
  supportsTinymistTypstEditor as supportsTypstEditorSupport,
  createTinymistTypstEditorExtensions as createTypstEditorSupport,
} from '../../services/tinymist/editor'
import { rememberPendingMarkdownForwardSync } from '../../services/markdown/previewSync.js'
import { rememberPendingTypstForwardSync } from '../../services/typst/previewSync.js'
import { resolveCachedTypstRootPath, resolveTypstCompileTarget } from '../../services/typst/root.js'
import EditorContextMenu from './EditorContextMenu.vue'
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
const linksStore = useLinksStore()
const toastStore = useToastStore()
const typstStore = useTypstStore()
const latexStore = useLatexStore()
const { t } = useI18n()
const loadError = computed(() => files.getFileLoadError(props.filePath))

let view = null
let backwardSyncHandler = null
let latexCursorRequestHandler = null
let markdownCursorRequestHandler = null
let typstCursorRequestHandler = null
let markdownPreviewSyncTimer = null
let typstPreviewSyncTimer = null
let cleanupTypstWindowListeners = null
let editorRuntimeActive = false
let pendingContextMenuState = null
let contextMenuRestoreFrame = null
let contextMenuRestoreTimeout = null
let latexNormalizedSaveContent = null
let latexFormatOnSaveInFlight = false
let typstNormalizedSaveContent = null
let typstFormatOnSaveInFlight = false
let lastPersistedContent = ''

const isMd = isMarkdown(props.filePath)
const isTex = isLatex(props.filePath)
const isTyp = isTypst(props.filePath)
const supportsTypstSupport = supportsTypstEditorSupport(props.filePath)
const isMacPlatform =
  typeof navigator !== 'undefined' &&
  /mac/i.test(navigator.userAgentData?.platform || navigator.platform || '')

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
  typstUi,
  connectTinymistDocument,
  disconnectTinymistDocument,
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

const { showMergeViewIfNeeded } = useTextEditorBridges({
  filePath: props.filePath,
  editorContainer,
  getView,
  files,
  isMarkdownFile: isMd,
  isLatexFile: isTex,
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
    ctxMenu.typstCodeActions = normalizeTinymistCodeActions(result).slice(0, 5)
  } catch {
    if (!ctxMenu.show || requestId !== ctxMenu.requestId) return
    ctxMenu.typstCodeActions = []
  }
}

async function handleApplyTypstCodeAction(action) {
  if (!action?.edit) {
    toastStore.show(t('No code actions could be applied at the current cursor location.'), {
      type: 'warning',
      duration: 3200,
    })
    return
  }

  try {
    const applied = await applyTinymistWorkspaceEdit(action.edit, {
      filesStore: files,
      editorStore,
    })

    if (applied.totalFiles === 0) {
      toastStore.show(t('No code actions could be applied at the current cursor location.'), {
        type: 'warning',
        duration: 3200,
      })
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
        { type: 'warning', duration: 5000 }
      )
      return
    }

    toastStore.show(
      t('Applied code action to {count} file(s).', {
        count: applied.appliedFiles.length,
      }),
      { type: 'success', duration: 2600 }
    )
  } catch (error) {
    toastStore.showOnce(
      'tinymist-code-action-failed',
      t('Typst code action failed: {error}', {
        error: error?.message || String(error || ''),
      }),
      { type: 'error', duration: 5000 },
      3000
    )
  }
}

async function handleFormatDocument() {
  if (!view || (!isTyp && !isTex)) return

  if (isTyp) {
    if (!typstUi.tinymistActive) {
      toastStore.showOnce(
        'tinymist-format-unavailable',
        t('Tinymist is not available for formatting.'),
        { type: 'error', duration: 4000 },
        5000
      )
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
      toastStore.showOnce(
        'tinymist-format-failed',
        t('Typst formatting failed: {error}', {
          error: error?.message || String(error || ''),
        }),
        { type: 'error', duration: 5000 },
        3000
      )
    }
    return
  }

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

async function requestFormattedTypstContent(content, options = {}) {
  if (!typstUi.tinymistActive) {
    if (options.notifyUnavailable) {
      toastStore.showOnce(
        'tinymist-format-unavailable',
        t('Tinymist is not available for formatting.'),
        { type: 'error', duration: 4000 },
        5000
      )
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
  const currentContent =
    typeof content === 'string' ? content : view ? view.state.doc.toString() : ''

  if (isTex) {
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
    void latexStore.scheduleAutoBuildForPath(props.filePath, {
      sourceContent: nextContent,
    })
    return true
  }

  if (isTyp) {
    if (typstNormalizedSaveContent != null && currentContent === typstNormalizedSaveContent) {
      typstNormalizedSaveContent = null
      lastPersistedContent = currentContent
      editorStore.clearFileDirty(props.filePath)
      return true
    }

    let nextContent = currentContent
    if (typstStore.formatOnSave && !typstFormatOnSaveInFlight) {
      try {
        typstFormatOnSaveInFlight = true
        const formatted = await requestFormattedTypstContent(currentContent)
        if (typeof formatted === 'string' && formatted !== currentContent) {
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
        toastStore.showOnce(
          'typst-format-on-save-failed',
          t('Typst format on save failed: {error}', {
            error: error?.message || String(error || ''),
          }),
          { type: 'error', duration: 5000 },
          3000
        )
      } finally {
        typstFormatOnSaveInFlight = false
      }
    }

    const saved = await files.saveFile(props.filePath, nextContent)
    if (!saved) return false
    lastPersistedContent = nextContent
    editorStore.clearFileDirty(props.filePath)
    void typstStore.scheduleAutoBuildForPath(props.filePath, {
      sourceContent: nextContent,
    })
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
  if (isMd) {
    const { markdown, markdownLanguage } = await import('@codemirror/lang-markdown')
    return markdown({ base: markdownLanguage, codeLanguages: languages })
  }
  if (isTex) {
    const { altalsLatexLanguage } = await import('../../editor/latexLanguage')
    return altalsLatexLanguage
  }
  if (isTyp) {
    return null
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
    content = await files.readFile(props.filePath)
  }
  if (content === null && loadError.value) return
  if (content === null) content = ''

  lastPersistedContent = content
  editorStore.clearFileDirty(props.filePath)

  if (isTex) {
    void latexStore.checkTools().catch(() => {})
    void latexStore
      .refreshLint(props.filePath, {
        sourceContent: content,
      })
      .catch(() => {})
    void resolveLatexProjectGraph(props.filePath, {
      filesStore: files,
      workspacePath: workspace.path,
    })
  }

  const langExt = await loadLanguageExtension()
  const extraExtensions = [
    Prec.highest(zoomAwareMouseSelectionExtension(getCssRootZoomScale)),
    ...createRevealHighlightExtension(),
    EditorView.updateListener.of((update) => {
      if (update.selectionSet || update.docChanged) {
        const selection = update.state.selection.main
        emit('selection-change', selection.from !== selection.to)
      }
      if (isTyp && update.docChanged) {
        scheduleTinymistSync(update.state.doc.toString())
        if (!tinymistNavUi.jumpInFlight) {
          handleNavigationSelectionChange()
        }
      }
      if (isTyp && update.selectionSet && !typstUi.jumpInFlight && !tinymistNavUi.jumpInFlight) {
        handleEditorSelectionChange(update.state.selection.main.head)
        handleNavigationSelectionChange()
        scheduleTypstSelectionPreviewSync(update.state.selection.main)
      }
      if (isMd && update.selectionSet) {
        scheduleMarkdownSelectionPreviewSync(update.state.selection.main)
      }
    }),
  ]

  if (isTyp) {
    const { createTypstDiagnosticsExtension } = await import('../../editor/typstEditorIntegration')
    extraExtensions.push(...createTypstDiagnosticsExtension())
  }

  if (isMd) {
    const [{ autocompletion }, { createMarkdownDraftEditorExtensions }] = await Promise.all([
      import('@codemirror/autocomplete'),
      import('../../editor/markdownDraftAssist'),
    ])
    const completionSources = [createMarkdownDraftSnippetSource(t)]
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

  if (isTex) {
    const [{ autocompletion }, { createLatexCompletionSource }] = await Promise.all([
      import('@codemirror/autocomplete'),
      import('../../editor/latexAutocomplete'),
    ])
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

  if (supportsTypstSupport) {
    extraExtensions.push(
      ...createTypstEditorSupport({
        filePath: props.filePath,
        filesStore: files,
        isEnabled: () => typstStore.inlayHints,
        openFile: (path) => editorStore.openFile(path),
        toastStore,
        t,
        workspacePath: workspace.path,
      })
    )

    extraExtensions.push(
      Prec.highest(
        keymap.of([
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
        ])
      )
    )
  }

  const extensions = createEditorExtensions({
    softWrap: workspace.softWrap,
    wrapColumn: workspace.wrapColumn,
    languageExtension: langExt,
    autoSaveEnabled: workspace.autoSave,
    onDocChanged: handleDocumentChanged,
    onSave: (nextContent) => {
      void persistEditorContent(nextContent)
    },
    onCursorChange: (pos) => emit('cursor-change', pos),
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

  activateEditorRuntime()
})

function ensureLatexWindowHandlers() {
  if (!isTex) return

  if (!backwardSyncHandler) {
    backwardSyncHandler = (event) => {
      const { file, line } = event.detail || {}
      const normalizedFile = String(file || '').replace(/\\/g, '/')
      const normalizedCurrentPath = String(props.filePath || '').replace(/\\/g, '/')
      if (normalizedFile) {
        const targetFileName = normalizedFile.split('/').pop() || normalizedFile
        const currentFileName = normalizedCurrentPath.split('/').pop() || normalizedCurrentPath
        const exactMatch = normalizedFile === normalizedCurrentPath
        const fileNameOnlyMatch =
          !normalizedFile.includes('/') && targetFileName === currentFileName
        if (!exactMatch && !fileNameOnlyMatch) return
      }
      if (line && line > 0) {
        focusEditorLineWithHighlight(view, line, { center: true })
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
  }
}

function ensureTypstWindowHandlers() {
  if (!isTyp || typstCursorRequestHandler) return

  typstCursorRequestHandler = (event) => {
    if (!view || event.detail?.sourcePath !== props.filePath) return
    const pos = view.state.selection.main.head
    const location = getTypstSyncLocation(pos)
    if (!location) return
    void dispatchTypstForwardSyncFromLocation(location, {
      revealPreview: false,
      trigger: 'typst-request-cursor',
    })
  }
}

function attachEditorRuntimeListeners() {
  editorContainer.value?.addEventListener('mousedown', handleContextMenuMouseDown, true)
  if (isMd) {
    editorContainer.value?.addEventListener('click', handleWikiLinkClick)
  }
  if (isTyp) {
    editorContainer.value?.addEventListener('click', handleDefinitionClick)
  }
  if (isTyp && !cleanupTypstWindowListeners) {
    cleanupTypstWindowListeners = registerTypstWindowListeners(isTyp)
  }

  if (isMd) {
    ensureMarkdownWindowHandlers()
    window.addEventListener('markdown-request-cursor', markdownCursorRequestHandler)
  }
  if (isTyp) {
    ensureTypstWindowHandlers()
    window.addEventListener('typst-request-cursor', typstCursorRequestHandler)
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
  }
  if (isTyp) {
    editorContainer.value?.removeEventListener('click', handleDefinitionClick)
  }
  if (cleanupTypstWindowListeners) {
    cleanupTypstWindowListeners()
    cleanupTypstWindowListeners = null
  }
  if (markdownCursorRequestHandler) {
    window.removeEventListener('markdown-request-cursor', markdownCursorRequestHandler)
  }
  if (typstCursorRequestHandler) {
    window.removeEventListener('typst-request-cursor', typstCursorRequestHandler)
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

function scheduleMarkdownSelectionPreviewSync(selection) {
  if (!isMd || !view) return
  if (!workflowStore.hasPreviewForSource(props.filePath, 'html')) return
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
  }, 90)
}

async function resolveTypstForwardRootPath() {
  const fallbackRootPath =
    typstStore.stateForFile(props.filePath)?.projectRootPath ||
    typstStore.stateForFile(props.filePath)?.compileTargetPath ||
    resolveCachedTypstRootPath(props.filePath) ||
    props.filePath

  if (!view) return fallbackRootPath

  try {
    const rootPath = await resolveTypstCompileTarget(props.filePath, {
      filesStore: files,
      workspacePath: workspace.path,
      contentOverrides: {
        [props.filePath]: view.state.doc.toString(),
      },
    })
    return rootPath || fallbackRootPath
  } catch {
    return fallbackRootPath
  }
}

function dispatchTypstForwardSync(detail) {
  window.dispatchEvent(new CustomEvent('typst-forward-sync-location', { detail }))
}

async function dispatchTypstForwardSyncFromLocation(location, options = {}) {
  if (!location) return
  const rootPath = await resolveTypstForwardRootPath()
  const detail = {
    sourcePath: props.filePath,
    rootPath,
    line: location.line,
    character: location.character,
  }
  rememberPendingTypstForwardSync(detail)

  if (options.revealPreview !== false) {
    workflowStore.revealPreview(props.filePath, {
      previewKind: 'native',
      sourcePaneId: props.paneId,
      trigger: options.trigger || 'typst-source-dblclick',
    })
  }

  dispatchTypstForwardSync(detail)
}

async function triggerTypstForwardSyncAtPos(pos, trigger = 'typst-source-dblclick') {
  const location = getTypstSyncLocation(pos)
  if (!location) return
  await dispatchTypstForwardSyncFromLocation(location, { trigger })
}

function scheduleTypstSelectionPreviewSync(selection) {
  if (!isTyp || !view) return
  const previewPath = workflowStore.getOpenPreviewPathForSource(props.filePath, 'native')
  if (!previewPath || !editorStore.findPaneWithTab(previewPath)?.id) return
  if ((selection?.from ?? 0) !== (selection?.to ?? 0)) return

  if (typstPreviewSyncTimer != null) {
    window.clearTimeout(typstPreviewSyncTimer)
    typstPreviewSyncTimer = null
  }

  const pos = Number(selection?.head ?? -1)
  if (!Number.isInteger(pos) || pos < 0) return

  typstPreviewSyncTimer = window.setTimeout(() => {
    typstPreviewSyncTimer = null
    void triggerTypstForwardSyncAtPos(pos, 'typst-source-selection')
  }, 90)
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

function getTypstSyncLocation(pos) {
  if (!view || !Number.isInteger(pos)) return null
  const line = view.state.doc.lineAt(pos)
  if (!line?.number || line.number < 1) return null
  return {
    line: Math.max(0, line.number - 1),
    character: Math.max(0, pos - line.from),
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
  if (markdownPreviewSyncTimer != null) {
    window.clearTimeout(markdownPreviewSyncTimer)
    markdownPreviewSyncTimer = null
  }
  if (typstPreviewSyncTimer != null) {
    window.clearTimeout(typstPreviewSyncTimer)
    typstPreviewSyncTimer = null
  }
  if (isTyp) {
    void disconnectTinymistDocument()
  }
  if (view) {
    view.destroy()
    view = null
  }
  pendingContextMenuState = null
  clearContextMenuRestoreHandles()
  backwardSyncHandler = null
  latexCursorRequestHandler = null
  markdownCursorRequestHandler = null
  typstCursorRequestHandler = null
})
</script>

<style scoped>
.typst-editor-shell {
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
