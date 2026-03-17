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
      @new-tab="editorStore.openNewTab(paneId)"
    />

    <!-- File-specific review bar -->
    <ReviewBar v-if="activeTab && viewerType === 'text'" :filePath="activeTab" />
    <DocxReviewBar v-else-if="activeTab && viewerType === 'docx'" :filePath="activeTab" :paneId="paneId" />
    <NotebookReviewBar v-else-if="activeTab && viewerType === 'notebook'" :filePath="activeTab" />
    <div
      v-if="showDocumentHeader"
      class="document-header-stack"
      :class="{
        'document-header-stack-with-subbar': pdfToolbarTargetSelector,
        'document-header-stack-subbar-only': !workflowUiState && pdfToolbarTargetSelector,
      }"
    >
      <DocumentWorkflowBar
        v-if="workflowUiState"
        :ui-state="workflowUiState"
        :can-view-log="workflowCanViewLog"
        :status-text="workflowStatusText"
        :status-tone="workflowStatusTone"
        @primary-action="handleWorkflowPrimaryAction"
        @reveal-preview="handleWorkflowRevealPreview"
        @create-pdf="handleExportPdf"
        @view-log="handleWorkflowViewLog"
      />
      <div
        v-if="pdfToolbarTargetSelector"
        :id="pdfToolbarTargetId"
        class="document-header-subbar"
        :class="{ 'document-header-subbar-standalone': !workflowUiState }"
      />
    </div>

    <!-- Editor or empty state -->
    <div class="flex-1 overflow-hidden relative" ref="editorContainerRef"
         :class="{ 'flex flex-col': viewerType === 'text' }"
         style="background: var(--bg-primary);">
      <KeepAlive :max="TEXT_EDITOR_CACHE_MAX">
        <component
          :is="TextEditor"
          v-if="activeTab && viewerType === 'text'"
          :key="`text:${activeTab}`"
          class="flex-1 min-w-0 h-full"
          :filePath="activeTab"
          :paneId="paneId"
          @cursor-change="(pos) => $emit('cursor-change', pos)"
          @editor-stats="(stats) => $emit('editor-stats', stats)"
          @selection-change="onSelectionChange"
        />
      </KeepAlive>
      <DocumentPdfViewer
        v-if="activeTab && viewerType === 'pdf'"
        :key="activeTab"
        :filePath="activeTab"
        :paneId="paneId"
        :toolbar-target-selector="pdfToolbarTargetSelector"
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
import { computed, ref, toRef, defineAsyncComponent } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useFilesStore } from '../../stores/files'
import { useChatStore } from '../../stores/chat'
import { useWorkspaceStore } from '../../stores/workspace'
import { useToastStore } from '../../stores/toast'
import { useCommentsStore } from '../../stores/comments'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useReferencesStore } from '../../stores/references'
import { getViewerType, isReferencePath, referenceKeyFromPath, isChatTab, getChatSessionId } from '../../utils/fileTypes'
import { useLatexStore } from '../../stores/latex'
import { useTypstStore } from '../../stores/typst'
import { useI18n } from '../../i18n'
import { useEditorPaneComments } from '../../composables/useEditorPaneComments'
import { useEditorPaneWorkflow } from '../../composables/useEditorPaneWorkflow'
import TabBar from './TabBar.vue'
import ReviewBar from './ReviewBar.vue'
const TextEditor = defineAsyncComponent(() => import('./TextEditor.vue'))
const DocumentPdfViewer = defineAsyncComponent(() => import('./DocumentPdfViewer.vue'))
const CsvEditor = defineAsyncComponent(() => import('./CsvEditor.vue'))
const ImageViewer = defineAsyncComponent(() => import('./ImageViewer.vue'))
const DocxEditor = defineAsyncComponent(() => import('./DocxEditor.vue'))
const DocxReviewBar = defineAsyncComponent(() => import('./DocxReviewBar.vue'))
const ReferenceView = defineAsyncComponent(() => import('./ReferenceView.vue'))
const NotebookEditor = defineAsyncComponent(() => import('./NotebookEditor.vue'))
const NotebookReviewBar = defineAsyncComponent(() => import('./NotebookReviewBar.vue'))
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
const workflowStore = useDocumentWorkflowStore()
const referencesStore = useReferencesStore()
const { t } = useI18n()
const paneIdRef = toRef(props, 'paneId')
const tabsRef = toRef(props, 'tabs')
const activeTabRef = toRef(props, 'activeTab')

const isActive = computed(() => editorStore.activePaneId === props.paneId)
const viewerType = computed(() => props.activeTab ? getViewerType(props.activeTab) : null)
const viewerTypeRef = viewerType
const refKey = computed(() => props.activeTab && isReferencePath(props.activeTab) ? referenceKeyFromPath(props.activeTab) : null)
const TEXT_EDITOR_CACHE_MAX = 4

const editorContainerRef = ref(null)
const {
  hasEditorSelection,
  showCommentPanel,
  containerRect,
  currentEditorView,
  commentPanelMode,
  commentSelectionRange,
  commentSelectionText,
  onSelectionChange,
  closeCommentPanel,
  onCommentCreated,
  startComment,
} = useEditorPaneComments({
  paneIdRef,
  activeTabRef,
  viewerTypeRef,
  editorStore,
  commentsStore,
  editorContainerRef,
})

const {
  pdfToolbarTargetId,
  pdfToolbarTargetSelector,
  showDocumentHeader,
  workflowUiState,
  workflowCanViewLog,
  workflowStatusText,
  workflowStatusTone,
  handleRunCode,
  handleRunFile,
  handleRenderDocument,
  handleCompileTex,
  handleCompileTypst,
  handlePreviewPdf,
  handlePreviewMarkdown,
  handleWorkflowPrimaryAction,
  handleWorkflowRevealPreview,
  handleWorkflowViewLog,
  handleExportPdf,
} = useEditorPaneWorkflow({
  paneIdRef,
  tabsRef,
  activeTabRef,
  viewerTypeRef,
  editorStore,
  filesStore,
  chatStore,
  workspace,
  latexStore,
  typstStore,
  toastStore,
  workflowStore,
  referencesStore,
  t,
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

<style scoped>
.document-header-stack {
  --document-header-row-height: 24px;
  flex: none;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 4;
  width: 100%;
  box-sizing: border-box;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}

.document-header-stack-subbar-only {
  border-bottom: 1px solid var(--border);
}

.document-header-subbar {
  display: flex;
  width: 100%;
  height: var(--document-header-row-height);
  min-width: 0;
  box-sizing: border-box;
  min-height: 0;
  border-top: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  overflow: visible;
}

.document-header-subbar-standalone {
  border-top: 0;
}
</style>
