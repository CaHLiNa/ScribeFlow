<template>
  <div
    class="flex flex-col h-full"
    :data-pane-id="paneId"
    :class="{ 'outline outline-1 outline-[var(--accent)]': isActive }"
    @mousedown="editorStore.setActivePane(paneId)"
  >
    <!-- Tab bar -->
    <TabBar
      v-if="tabs.length > 0"
      :tabs="tabs"
      :activeTab="activeTab"
      :paneId="paneId"
      @select-tab="selectTab"
      @close-tab="closeTab"
      @split-vertical="splitVertical"
      @split-horizontal="splitHorizontal"
      @close-pane="closePane"
      @run-code="handleRunCode"
      @run-file="handleRunFile"
      @render-document="handleRenderDocument"
      @compile-tex="handleCompileTex"
      @compile-typst="handleCompileTypst"
      @preview-pdf="handlePreviewPdf"
      @preview-markdown="handlePreviewMarkdown"
      @export-pdf="handleExportPdf"
      @translate-pdf="handleTranslatePdf"
      @new-tab="editorStore.openNewTab(paneId)"
    />

    <!-- File-specific review bar -->
    <ReviewBar v-if="activeTab && viewerType === 'text'" :filePath="activeTab" />
    <DocxReviewBar v-else-if="activeTab && viewerType === 'docx'" :filePath="activeTab" :paneId="paneId" />
    <NotebookReviewBar v-else-if="activeTab && viewerType === 'notebook'" :filePath="activeTab" />
    <DocumentWorkflowBar
      v-if="activeTab && workflowUiState"
      :ui-state="workflowUiState"
      :can-view-log="workflowCanViewLog"
      :status-text="workflowStatusText"
      :status-tone="workflowStatusTone"
      @primary-action="handleWorkflowPrimaryAction"
      @reveal-preview="handleWorkflowRevealPreview"
      @create-pdf="handleExportPdf"
      @view-log="handleWorkflowViewLog"
    />

    <!-- Editor or empty state -->
    <div class="flex-1 overflow-hidden relative" ref="editorContainerRef"
         :class="{ 'flex flex-col': viewerType === 'text' }"
         style="background: var(--bg-primary);">
      <div v-if="activeTab && viewerType === 'text'" class="flex-1 min-w-0 h-full">
        <TextEditor
          :key="activeTab"
          :filePath="activeTab"
          :paneId="paneId"
          @cursor-change="(pos) => $emit('cursor-change', pos)"
          @editor-stats="(stats) => $emit('editor-stats', stats)"
          @selection-change="onSelectionChange"
        />
      </div>
      <LatexPdfViewer
        v-else-if="activeTab && viewerType === 'pdf' && hasTexSource"
        :key="activeTab"
        :filePath="activeTab"
        :paneId="paneId"
      />
      <TypstPdfViewer
        v-else-if="activeTab && viewerType === 'pdf' && hasTypstSource"
        :key="activeTab"
        :filePath="activeTab"
        :paneId="paneId"
      />
      <PdfViewer
        v-else-if="activeTab && viewerType === 'pdf'"
        :key="activeTab"
        :filePath="activeTab"
        :paneId="paneId"
      />
      <CsvEditor
        v-else-if="activeTab && viewerType === 'csv'"
        :key="activeTab"
        :filePath="activeTab"
        :paneId="paneId"
      />
      <DocxEditor
        v-else-if="activeTab && viewerType === 'docx'"
        :key="activeTab"
        :filePath="activeTab"
        :paneId="paneId"
        @cursor-change="(pos) => $emit('cursor-change', pos)"
        @editor-stats="(stats) => $emit('editor-stats', stats)"
      />
      <ImageViewer
        v-else-if="activeTab && viewerType === 'image'"
        :key="activeTab"
        :filePath="activeTab"
        :paneId="paneId"
      />
      <NotebookEditor
        v-else-if="activeTab && viewerType === 'notebook'"
        :key="activeTab"
        :filePath="activeTab"
        :paneId="paneId"
      />
      <MarkdownPreview
        v-else-if="activeTab && viewerType === 'markdown-preview'"
        :key="activeTab"
        :filePath="activeTab"
        :paneId="paneId"
      />
      <ReferenceView
        v-else-if="activeTab && viewerType === 'reference'"
        :key="activeTab"
        :refKey="refKey"
        :paneId="paneId"
      />
      <div v-else-if="activeTab && viewerType === 'chat'" class="h-full" :data-chat-panel="paneId">
        <ChatPanel
          :key="activeTab"
          :filePath="activeTab"
          :paneId="paneId"
        />
      </div>
      <NewTab v-else-if="activeTab && viewerType === 'newtab'" :key="activeTab" :paneId="paneId" />
      <EmptyPane v-else-if="!activeTab" :paneId="paneId" />

      <!-- Comment margin (only for text files with margin visible) -->
      <CommentMargin
        v-if="activeTab && viewerType === 'text' && commentsStore.isMarginVisible(activeTab)"
        :filePath="activeTab"
        :paneId="paneId"
        :hasSelection="hasEditorSelection"
      />

      <!-- Comment floating panel (absolute overlay) -->
      <CommentPanel
        v-if="activeTab && viewerType === 'text' && showCommentPanel"
        :comment="commentsStore.activeComment"
        :filePath="activeTab"
        :paneId="paneId"
        :editorView="currentEditorView"
        :containerRect="containerRect"
        :mode="commentPanelMode"
        :selectionRange="commentSelectionRange"
        :selectionText="commentSelectionText"
        @close="closeCommentPanel"
        @comment-created="onCommentCreated"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, defineAsyncComponent, watch } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useFilesStore } from '../../stores/files'
import { useChatStore } from '../../stores/chat'
import { useWorkspaceStore } from '../../stores/workspace'
import { useToastStore } from '../../stores/toast'
import { useCommentsStore } from '../../stores/comments'
import { usePdfTranslateStore } from '../../stores/pdfTranslate'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { EditorView } from '@codemirror/view'
import { getViewerType, isReferencePath, referenceKeyFromPath, getLanguage, isLatex, isRmdOrQmd, isChatTab, getChatSessionId, isTypst } from '../../utils/fileTypes'
import { sendCode, runFile, renderDocument } from '../../services/codeRunner'
import { useLatexStore } from '../../stores/latex'
import { useTypstStore } from '../../stores/typst'
import { useI18n } from '../../i18n'
import TabBar from './TabBar.vue'
import ReviewBar from './ReviewBar.vue'
import TextEditor from './TextEditor.vue'
import PdfViewer from './PdfViewer.vue'
import CsvEditor from './CsvEditor.vue'
import ImageViewer from './ImageViewer.vue'
const DocxEditor = defineAsyncComponent(() => import('./DocxEditor.vue'))
const DocxReviewBar = defineAsyncComponent(() => import('./DocxReviewBar.vue'))
const ReferenceView = defineAsyncComponent(() => import('./ReferenceView.vue'))
const NotebookEditor = defineAsyncComponent(() => import('./NotebookEditor.vue'))
const NotebookReviewBar = defineAsyncComponent(() => import('./NotebookReviewBar.vue'))
const LatexPdfViewer = defineAsyncComponent(() => import('./LatexPdfViewer.vue'))
const TypstPdfViewer = defineAsyncComponent(() => import('./TypstPdfViewer.vue'))
const MarkdownPreview = defineAsyncComponent(() => import('./MarkdownPreview.vue'))
const DocumentWorkflowBar = defineAsyncComponent(() => import('./DocumentWorkflowBar.vue'))
const ChatPanel = defineAsyncComponent(() => import('../chat/ChatPanel.vue'))
const CommentMargin = defineAsyncComponent(() => import('../comments/CommentMargin.vue'))
const CommentPanel = defineAsyncComponent(() => import('../comments/CommentPanel.vue'))
const NewTab = defineAsyncComponent(() => import('./NewTab.vue'))
const EmptyPane = defineAsyncComponent(() => import('./EmptyPane.vue'))

const props = defineProps({
  paneId: { type: String, required: true },
  tabs: { type: Array, default: () => [] },
  activeTab: { type: String, default: null },
})

const emit = defineEmits(['cursor-change', 'editor-stats', 'selection-change'])

const editorStore = useEditorStore()
const filesStore = useFilesStore()
const chatStore = useChatStore()
const workspace = useWorkspaceStore()
const latexStore = useLatexStore()
const typstStore = useTypstStore()
const toastStore = useToastStore()
const commentsStore = useCommentsStore()
const pdfTranslateStore = usePdfTranslateStore()
const workflowStore = useDocumentWorkflowStore()
const { t } = useI18n()

// ── Comment state ──────────────────────────────────────────────────
const hasEditorSelection = ref(false)
const editorContainerRef = ref(null)
const commentPanelMode = ref('view')
const commentSelectionRange = ref(null)
const commentSelectionText = ref(null)

function onSelectionChange(hasSelection) {
  hasEditorSelection.value = hasSelection
}

const showCommentPanel = computed(() => {
  if (commentPanelMode.value === 'create') return true
  if (!commentsStore.activeCommentId) return false
  const comment = commentsStore.activeComment
  return comment && comment.filePath === props.activeTab
})

const containerRect = computed(() => {
  return editorContainerRef.value?.getBoundingClientRect() || null
})

const currentEditorView = computed(() => {
  if (!props.activeTab || viewerType.value !== 'text') return null
  return editorStore.getEditorView(props.paneId, props.activeTab)
})

function closeCommentPanel() {
  commentsStore.setActiveComment(null)
  commentPanelMode.value = 'view'
  commentSelectionRange.value = null
  commentSelectionText.value = null
}

function onCommentCreated(comment) {
  commentPanelMode.value = 'view'
  commentSelectionRange.value = null
  commentSelectionText.value = null
  commentsStore.setActiveComment(comment.id)
}

function startComment() {
  const view = currentEditorView.value
  if (!view) return
  const sel = view.state.selection.main
  if (sel.from === sel.to) return

  commentPanelMode.value = 'create'
  commentSelectionRange.value = { from: sel.from, to: sel.to }
  commentSelectionText.value = view.state.sliceDoc(sel.from, sel.to)
  commentsStore.setActiveComment(null)

  if (!commentsStore.isMarginVisible(props.activeTab)) {
    commentsStore.toggleMargin(props.activeTab)
  }
}

function handleCommentCreate(e) {
  if (e.detail?.paneId !== props.paneId) return
  startComment()
}

function handleCommentScrollTo(e) {
  const { commentId, filePath } = e.detail || {}
  if (filePath !== props.activeTab) return
  const view = currentEditorView.value
  if (!view) return
  const comment = commentsStore.commentsForFile(filePath).find(c => c.id === commentId)
  if (!comment) return
  view.dispatch({
    effects: EditorView.scrollIntoView(comment.range.from, { y: 'start', yMargin: 50 }),
  })
}

const isActive = computed(() => editorStore.activePaneId === props.paneId)
const viewerType = computed(() => props.activeTab ? getViewerType(props.activeTab) : null)
const workflowUiState = computed(() => props.activeTab ? workflowStore.getUiStateForFile(props.activeTab) : null)
const workflowCanViewLog = computed(() => {
  const kind = workflowUiState.value?.kind
  return kind === 'latex' || kind === 'typst'
})
const workflowStatusText = computed(() => {
  if (!props.activeTab || !workflowUiState.value) return ''

  if (workflowUiState.value.kind === 'latex') {
    const state = latexStore.stateForFile(props.activeTab)
    if (state?.status === 'compiling') return t('Compiling...')
    if (state?.status === 'success') {
      const ms = state?.durationMs
      if (!ms) return t('Compiled')
      if (ms < 1000) return `${ms}ms`
      return `${(ms / 1000).toFixed(1)}s`
    }
  }

  if (workflowUiState.value.kind === 'typst') {
    const state = typstStore.stateForFile(props.activeTab)
    if (state?.status === 'compiling') return t('Compiling...')
    if (state?.status === 'success') {
      const ms = state?.durationMs
      if (!ms) return t('Compiled')
      if (ms < 1000) return `${ms}ms`
      return `${(ms / 1000).toFixed(1)}s`
    }
  }

  if (workflowUiState.value.kind === 'markdown' && workflowUiState.value.phase === 'rendering') {
    return t('Rendering...')
  }

  return ''
})
const workflowStatusTone = computed(() => {
  if (!workflowUiState.value) return 'muted'
  if (workflowUiState.value.phase === 'compiling' || workflowUiState.value.phase === 'rendering') return 'running'
  if (workflowUiState.value.phase === 'ready') return 'success'
  return 'muted'
})

const refKey = computed(() => props.activeTab && isReferencePath(props.activeTab) ? referenceKeyFromPath(props.activeTab) : null)
// Check if this PDF has a corresponding .tex source (for LaTeX PDF viewer)
const hasTexSource = computed(() => {
  if (viewerType.value !== 'pdf' || !props.activeTab) return false
  const texPath = props.activeTab.replace(/\.pdf$/, '.tex')
  // Check if .tex file is known to the file system (open or in tree)
  return filesStore.fileContents[texPath] !== undefined ||
         filesStore.flatFiles.some(f => f.path === texPath)
})

const hasTypstSource = computed(() => {
  if (viewerType.value !== 'pdf' || !props.activeTab || hasTexSource.value) return false
  const typPath = props.activeTab.replace(/\.pdf$/i, '.typ')
  return filesStore.fileContents[typPath] !== undefined
    || filesStore.flatFiles.some(f => f.path === typPath)
    || workflowStore.getSourcePathForPreview(props.activeTab) === typPath
})

function selectTab(path) {
  editorStore.setActiveTab(props.paneId, path)
}

function closeTab(path) {
  // Auto-save chat sessions on tab close
  if (isChatTab(path)) {
    const sid = getChatSessionId(path)
    if (sid) chatStore.saveSession(sid)
  }
  workflowStore.handlePreviewClosed(path)
  editorStore.closeTab(props.paneId, path)
}

function splitVertical() {
  editorStore.setActivePane(props.paneId)
  const newPaneId = editorStore.splitPane('vertical')
  editorStore.openNewTab(newPaneId)
}

function splitHorizontal() {
  editorStore.setActivePane(props.paneId)
  const newPaneId = editorStore.splitPane('horizontal')
  editorStore.openNewTab(newPaneId)
}

function handleRunCode() {
  if (!props.activeTab) return
  const lang = getLanguage(props.activeTab)
  if (!lang) return
  const editorView = editorStore.getEditorView(props.paneId, props.activeTab)
  if (!editorView) return

  const state = editorView.state
  const sel = state.selection.main

  if (isRmdOrQmd(props.activeTab)) {
    // Dispatch through chunk-execute so it routes through the kernel bridge in TextEditor
    import('../../editor/codeChunks').then(({ chunkField, chunkAtPosition }) => {
      const chunks = state.field(chunkField)
      const chunk = chunkAtPosition(chunks, state.doc, sel.head)
      if (!chunk) return // Cursor in prose — do nothing
      const idx = chunks.indexOf(chunk)
      if (idx >= 0) {
        editorView.dom.dispatchEvent(new CustomEvent('chunk-execute', {
          bubbles: true,
          detail: { chunkIdx: idx },
        }))
      }
    })
    return
  }

  // Plain script: send line or selection
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
  if (code) sendCode(code, lang)
}

function handleRunFile() {
  if (!props.activeTab) return
  const lang = getLanguage(props.activeTab)
  if (!lang) return

  if (isRmdOrQmd(props.activeTab)) {
    // Single event → TextEditor runs all chunks sequentially (shared kernel state)
    const editorView = editorStore.getEditorView(props.paneId, props.activeTab)
    if (!editorView) return
    editorView.dom.dispatchEvent(new CustomEvent('chunk-execute-all', { bubbles: true }))
    return
  }

  runFile(props.activeTab, lang)
}

function handleRenderDocument() {
  if (!props.activeTab) return
  renderDocument(props.activeTab)
}

async function handleCompileTex() {
  if (!props.activeTab || !isLatex(props.activeTab)) return
  await latexStore.compile(props.activeTab)
  const state = latexStore.stateForFile(props.activeTab)
  if (state?.status === 'success' && state.pdfPath) {
    ensurePdfOpen(state.pdfPath)
  }
}

async function handleCompileTypst() {
  if (!props.activeTab || !isTypst(props.activeTab)) return
  await typstStore.compile(props.activeTab)
}

async function handleTranslatePdf() {
  if (!props.activeTab || viewerType.value !== 'pdf') return

  try {
    await pdfTranslateStore.startTranslation(props.activeTab)
    const name = props.activeTab.split('/').pop()
    toastStore.show(t('Started translating {name}', { name }), {
      type: 'success',
      duration: 2500,
    })
  } catch (error) {
    const message = error?.message || String(error)
    toastStore.show(message, { type: 'error', duration: 5000 })
    workspace.openSettings('pdf-translate')
  }
}

function handlePreviewPdf() {
  if (!props.activeTab) return

  if (isLatex(props.activeTab)) {
    const state = latexStore.stateForFile(props.activeTab)
    const pdfPath = state?.pdfPath || props.activeTab.replace(/\.tex$/i, '.pdf')
    ensurePdfOpen(pdfPath)
    return
  }

  if (isTypst(props.activeTab)) {
    workflowStore.revealPreview(props.activeTab, {
      previewKind: 'pdf',
      sourcePaneId: props.paneId,
      trigger: 'typst-preview-button',
    })
  }
}

function handlePreviewMarkdown() {
  if (!props.activeTab) return
  workflowStore.ensurePreviewForSource(props.activeTab, {
    previewKind: 'html',
    activatePreview: true,
    sourcePaneId: props.paneId,
    trigger: 'markdown-preview-button',
  })
}

function handleWorkflowPrimaryAction() {
  if (!workflowUiState.value || !props.activeTab) return

  if (workflowUiState.value.kind === 'latex') {
    handleCompileTex()
    return
  }
  if (workflowUiState.value.kind === 'typst') {
    handleCompileTypst()
    return
  }
  handlePreviewMarkdown()
}

async function handleWorkflowRevealPreview() {
  if (!workflowUiState.value || !props.activeTab) return

  if (workflowUiState.value.kind === 'markdown') {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const pdfPath = props.activeTab.replace(/\.(md|rmd|qmd)$/i, '.pdf')
      const hasPdf = await invoke('path_exists', { path: pdfPath })
      if (hasPdf) {
        workflowStore.revealPreview(props.activeTab, {
          previewKind: 'pdf',
          sourcePaneId: props.paneId,
          trigger: 'workflow-reveal-markdown-pdf',
        })
        return
      }
    } catch {
      // Fall back to HTML preview if existence check fails.
    }

    handlePreviewMarkdown()
    return
  }

  workflowStore.revealPreview(props.activeTab, {
    previewKind: workflowUiState.value.previewKind,
    sourcePaneId: props.paneId,
    trigger: 'workflow-reveal-preview',
  })
}

function handleWorkflowViewLog() {
  if (!props.activeTab) return
  workflowStore.openLogForFile(props.activeTab)
}

async function handleExportPdf(settingsOverride) {
  if (!props.activeTab) return
  workflowStore.setMarkdownPdfState(props.activeTab, {
    status: 'rendering',
    problems: [],
  })
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const { useTypstStore } = await import('../../stores/typst')
    const { useWorkspaceStore } = await import('../../stores/workspace')
    const typstStore = useTypstStore()
    const workspace = useWorkspaceStore()

    // For .Rmd/.qmd: knit first (execute chunks, produce clean .md), then export that
    let mdPathForExport = props.activeTab
    let tempMdPath = null
    if (isRmdOrQmd(props.activeTab)) {
      const content = filesStore.fileContents[props.activeTab]
      if (content) {
        const { knitRmd } = await import('../../services/rmdKnit')
        // Write to .md with same stem so Typst outputs correctly-named PDF
        tempMdPath = props.activeTab.replace(/\.(rmd|qmd)$/i, '.md')
        const imageDir = props.activeTab.substring(0, props.activeTab.lastIndexOf('/'))
        const knitted = await knitRmd(content, workspace.path, { imageDir })
        await invoke('write_file', { path: tempMdPath, content: knitted })
        mdPathForExport = tempMdPath
      }
    }

    // Resolve settings: popover override > saved per-file > defaults
    const settings = settingsOverride || typstStore.getSettings(props.activeTab)

    // Inject citation style from references store if not already set
    if (!settings.bib_style) {
      const { useReferencesStore } = await import('../../stores/references')
      settings.bib_style = useReferencesStore().citationStyle
    }

    // For non-built-in styles, copy .csl file next to the .typ and pass filename
    const builtinTypstStyles = ['apa', 'chicago', 'ieee', 'harvard', 'vancouver']
    if (settings.bib_style && !builtinTypstStyles.includes(settings.bib_style)) {
      try {
        const cslUrl = `/csl/${settings.bib_style}.csl`
        const resp = await fetch(cslUrl)
        if (resp.ok) {
          const cslContent = await resp.text()
          const dir = props.activeTab.substring(0, props.activeTab.lastIndexOf('/'))
          const cslPath = `${dir}/${settings.bib_style}.csl`
          await invoke('write_file', { path: cslPath, content: cslContent })
          settings.bib_style = `${settings.bib_style}.csl`
        }
      } catch {
        // Fall back to APA if CSL file can't be loaded
        settings.bib_style = 'apa'
      }
    }

    // Check if PDF already exists before export
    const expectedPdfPath = props.activeTab.replace(/\.(md|rmd|qmd)$/i, '.pdf')
    const pdfExisted = await invoke('path_exists', { path: expectedPdfPath })

    // Generate .bib file from reference library (reuses LaTeX pipeline)
    let bibPath = null
    try {
      const { ensureBibFile } = await import('../../services/latexBib')
      bibPath = await ensureBibFile(props.activeTab)
    } catch (e) {
      // No references or bib generation failed — continue without
    }

    const result = await typstStore.exportToPdf(mdPathForExport, bibPath, settings)

    // Clean up temp files for .Rmd exports
    if (tempMdPath) {
      invoke('delete_path', { path: tempMdPath }).catch(() => {})
      // Clean up temp chunk images (_chunk_img_*.png/jpg)
      const dir = tempMdPath.substring(0, tempMdPath.lastIndexOf('/'))
      invoke('run_shell_command', {
        cwd: dir,
        command: 'rm -f _chunk_img_*',
      }).catch(() => {})
    }

    if (result?.success && result.pdf_path) {
      workflowStore.setMarkdownPdfState(props.activeTab, {
        status: 'ready',
        problems: [],
        pdfPath: result.pdf_path,
      })
      workflowStore.bindPreview({
        previewPath: result.pdf_path,
        sourcePath: props.activeTab,
        previewKind: 'pdf',
        kind: 'markdown',
      })
      if (!pdfExisted) {
        const pdfName = result.pdf_path.split('/').pop()
        const dur = result.duration_ms ? ` in ${result.duration_ms}ms` : ''
        toastStore.show(`Created ${pdfName}${dur}`)
      }

      workflowStore.revealPreview(props.activeTab, {
        previewKind: 'pdf',
        trigger: 'markdown-export-pdf',
      })
      window.dispatchEvent(new CustomEvent('pdf-updated', {
        detail: { path: result.pdf_path },
      }))
    } else if (result?.errors?.length) {
      workflowStore.setMarkdownPdfState(props.activeTab, {
        status: 'error',
        problems: result.errors.map((error, index) => ({
          id: `markdown-pdf:${props.activeTab}:${index}`,
          sourcePath: props.activeTab,
          line: error?.line || null,
          column: error?.column || null,
          severity: error?.severity || 'error',
          message: error?.message || String(error),
          origin: 'preview',
          actionable: true,
          raw: error?.raw || error?.message || String(error),
        })),
      })
      const errMsg = result.errors.map(e => e.message).join('\n')
      editorStore.openChatBeside({ prefill: `Typst export error:\n\`\`\`\n${errMsg}\n\`\`\`\nBriefly explain and fix.` })
    }
  } catch (e) {
    console.error('PDF export failed:', e)
    workflowStore.setMarkdownPdfState(props.activeTab, {
      status: 'error',
      problems: [{
        id: `markdown-pdf:${props.activeTab}:catch`,
        sourcePath: props.activeTab,
        line: null,
        column: null,
        severity: 'error',
        message: e?.message || String(e),
        origin: 'preview',
        actionable: true,
        raw: e?.stack || String(e),
      }],
    })
  }
}

function ensurePdfOpen(pdfPath) {
  const leaves = getAllLeaves(editorStore.paneTree)
  if (leaves.some(p => p.tabs.includes(pdfPath))) return

  const sourcePaneId = editorStore.activePaneId
  editorStore.splitPaneWith(sourcePaneId, 'vertical', pdfPath)
}

function getAllLeaves(node) {
  if (!node) return []
  if (node.type === 'leaf') return [node]
  return (node.children || []).flatMap(getAllLeaves)
}

function handleLatexCompileDone(e) {
  const { texPath, pdf_path, success } = e.detail || {}
  if (!success || !pdf_path) return
  if (!props.tabs.includes(texPath)) return
  ensurePdfOpen(pdf_path)
}

function handleTypstCompileDone(e) {
  const { typPath, pdf_path, success } = e.detail || {}
  if (!success || !pdf_path) return
  if (!props.tabs.includes(typPath)) return
  workflowStore.ensurePreviewForSource(typPath, {
    previewKind: 'pdf',
    activatePreview: false,
    sourcePaneId: props.paneId,
    trigger: 'typst-compile-success',
  })
}

watch(
  [() => props.activeTab, () => editorStore.activePaneId],
  () => {
    workflowStore.reconcile({ trigger: 'editor-pane-sync' })
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('latex-compile-done', handleLatexCompileDone)
  window.addEventListener('typst-compile-done', handleTypstCompileDone)
  window.addEventListener('comment-create', handleCommentCreate)
  window.addEventListener('comment-scroll-to', handleCommentScrollTo)
})
onUnmounted(() => {
  window.removeEventListener('latex-compile-done', handleLatexCompileDone)
  window.removeEventListener('typst-compile-done', handleTypstCompileDone)
  window.removeEventListener('comment-create', handleCommentCreate)
  window.removeEventListener('comment-scroll-to', handleCommentScrollTo)
})

function closePane() {
  const pane = editorStore.findPane(editorStore.paneTree, props.paneId)
  if (!pane) return

  const parent = editorStore.findParent(editorStore.paneTree, pane.id)
  if (!parent) {
    // Root pane - just clear all tabs
    pane.tabs = []
    pane.activeTab = null
    return
  }

  // Directly collapse this pane so sibling expands to fill space
  editorStore.collapsePane(props.paneId)
}

defineExpose({ startComment })
</script>
