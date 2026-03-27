<template>
  <div
    class="flex flex-col h-full w-full min-w-0"
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
      @new-tab="editorStore.openNewTab(paneId)"
    />

    <!-- File-specific review bar -->
    <ReviewBar v-if="activeTab && viewerType === 'text'" :filePath="activeTab" />
    <NotebookReviewBar v-else-if="activeTab && viewerType === 'notebook'" :filePath="activeTab" />
    <div
      v-if="showDocumentHeader"
      class="document-header-stack"
    >
      <DocumentWorkflowBar
        v-if="toolbarUiState"
        :ui-state="toolbarUiState"
        :preview-state="workspacePreviewState"
        :pdf-toolbar-target-id="useDocumentWorkspaceTab ? pdfToolbarTargetId : ''"
        :status-text="workflowStatusText"
        :status-tone="workflowStatusTone"
        :show-run-buttons="showToolbarRunButtons"
        :show-comment-toggle="showCommentToolbar"
        :comment-active="isCommentToolbarActive"
        :comment-badge-count="commentToolbarBadgeCount"
        @primary-action="handleWorkflowPrimaryAction"
        @reveal-preview="handleWorkflowRevealPreview"
        @reveal-pdf="handleWorkflowRevealPdf"
        @run-code="handleRunCode"
        @run-file="handleRunFile"
        @diagnose-with-ai="handleWorkflowDiagnoseWithAi"
        @fix-with-ai="handleWorkflowFixWithAi"
        @toggle-comments="toggleCommentToolbar"
      />
      <div
        v-else-if="pdfToolbarTargetSelector"
        :id="pdfToolbarTargetId"
        class="document-header-subbar"
        :class="{ 'document-header-subbar-standalone': !toolbarUiState }"
      />
    </div>

    <!-- Editor or empty state -->
    <div
      class="editor-pane-surface flex-1 overflow-hidden relative w-full min-w-0"
      :class="{ 'flex flex-col': viewerType === 'text' && !documentWorkspaceRoute.useWorkspaceSurface }"
    >
      <EditorTextRouteSurface
        v-if="activeTab && viewerType === 'text'"
        ref="editorContainerRef"
        :use-workspace="documentWorkspaceRoute.useWorkspaceSurface"
        :preview-visible="documentWorkspaceRoute.previewVisible"
        :filePath="activeTab"
        :paneId="paneId"
        :show-comment-margin="commentsStore.isMarginVisible(activeTab)"
        :has-editor-selection="hasEditorSelection"
        :show-comment-panel="showCommentPanel"
        :active-comment="commentsStore.activeComment"
        :editor-view="currentEditorView"
        :container-rect="containerRect"
        :comment-panel-mode="commentPanelMode"
        :comment-selection-range="commentSelectionRange"
        :comment-selection-text="commentSelectionText"
        @cursor-change="(pos) => $emit('cursor-change', pos)"
        @editor-stats="(stats) => $emit('editor-stats', stats)"
        @selection-change="onSelectionChange"
        @close-comment-panel="closeCommentPanel"
        @comment-created="onCommentCreated"
      >
        <template #preview>
          <MarkdownPreview
            v-if="documentWorkspaceRoute.previewMode === 'markdown'"
            :key="`workspace-markdown:${activeTab}`"
            :filePath="activeTab"
            :paneId="paneId"
          />
          <TypstNativePreview
            v-else-if="documentWorkspaceRoute.previewMode === 'typst-native'"
            :key="`workspace-typst-native:${activeTab}`"
            :filePath="activeTab"
            :paneId="paneId"
            :sourcePath="activeTab"
          />
          <DocumentPdfViewer
            v-else-if="documentWorkspaceRoute.previewMode === 'pdf'"
            :key="`workspace-pdf:${activeTab}`"
            :filePath="documentWorkspaceRoute.previewTargetPath || activeTab"
            :paneId="paneId"
            :toolbar-target-selector="pdfToolbarTargetSelector"
            :sourcePath="activeTab"
            :preview-target-path="documentWorkspaceRoute.previewTargetPath"
            :resolved-target-path="documentWorkspaceRoute.previewTargetPath"
          />
        </template>
      </EditorTextRouteSurface>
      <DocumentPdfViewer
        v-else-if="activeTab && viewerType === 'pdf'"
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
      <UnsupportedFilePane
        v-else-if="activeTab && viewerType === 'unsupported-binary'"
        :key="activeTab"
        :filePath="activeTab"
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
      <TypstNativePreview
        v-else-if="activeTab && viewerType === 'typst-native-preview'"
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
        <ChatPanel :key="activeTab" :filePath="activeTab" :paneId="paneId" />
      </div>
      <AiLauncher
        v-else-if="activeTab && viewerType === 'ai-launcher'"
        :key="activeTab"
        :paneId="paneId"
      />
      <NewTab v-else-if="activeTab && viewerType === 'newtab'" :key="activeTab" :paneId="paneId" />
      <EmptyPane v-else-if="!activeTab" :paneId="paneId" />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, toRef, defineAsyncComponent, watch } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useFilesStore } from '../../stores/files'
import { useWorkspaceStore } from '../../stores/workspace'
import { useToastStore } from '../../stores/toast'
import { useCommentsStore } from '../../stores/comments'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useReferencesStore } from '../../stores/references'
import {
  getViewerType,
  isAiWorkbenchPath,
  isLibraryPath,
  isReferencePath,
  referenceKeyFromPath,
  isChatTab,
  getChatSessionId,
  isRunnable,
} from '../../utils/fileTypes'
import { useLatexStore } from '../../stores/latex'
import { useTypstStore } from '../../stores/typst'
import { useI18n } from '../../i18n'
import { useEditorPaneComments } from '../../composables/useEditorPaneComments'
import { useEditorPaneWorkflow } from '../../composables/useEditorPaneWorkflow'
import { confirmUnsavedChanges } from '../../services/unsavedChanges'
import { resolveDocumentWorkspaceTextRoute } from '../../domains/document/documentWorkspacePreviewRuntime'
import TabBar from './TabBar.vue'
import ReviewBar from './ReviewBar.vue'
const EditorTextRouteSurface = defineAsyncComponent(() => import('./EditorTextRouteSurface.vue'))
const DocumentPdfViewer = defineAsyncComponent(() => import('./DocumentPdfViewer.vue'))
const CsvEditor = defineAsyncComponent(() => import('./CsvEditor.vue'))
const ImageViewer = defineAsyncComponent(() => import('./ImageViewer.vue'))
const UnsupportedFilePane = defineAsyncComponent(() => import('./UnsupportedFilePane.vue'))
const ReferenceView = defineAsyncComponent(() => import('./ReferenceView.vue'))
const NotebookEditor = defineAsyncComponent(() => import('./NotebookEditor.vue'))
const NotebookReviewBar = defineAsyncComponent(() => import('./NotebookReviewBar.vue'))
const MarkdownPreview = defineAsyncComponent(() => import('./MarkdownPreview.vue'))
const TypstNativePreview = defineAsyncComponent(() => import('./TypstNativePreview.vue'))
const DocumentWorkflowBar = defineAsyncComponent(() => import('./DocumentWorkflowBar.vue'))
const ChatPanel = defineAsyncComponent(() => import('../chat/ChatPanel.vue'))
const AiLauncher = defineAsyncComponent(() => import('./AiLauncher.vue'))
const NewTab = defineAsyncComponent(() => import('./NewTab.vue'))
const EmptyPane = defineAsyncComponent(() => import('./EmptyPane.vue'))

const props = defineProps({
  paneId: { type: String, required: true },
  tabs: { type: Array, default: () => [] },
  activeTab: { type: String, default: null },
})

async function resolveChatStore() {
  const { useChatStore } = await import('../../stores/chat.js')
  return useChatStore()
}

const editorStore = useEditorStore()
const filesStore = useFilesStore()
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
const viewerType = computed(() => (props.activeTab ? getViewerType(props.activeTab) : null))
const viewerTypeRef = viewerType
const refKey = computed(() =>
  props.activeTab && isReferencePath(props.activeTab) ? referenceKeyFromPath(props.activeTab) : null
)
const showCommentToolbar = computed(() => !!props.activeTab && viewerType.value === 'text')
const showToolbarRunButtons = computed(
  () => !!props.activeTab && viewerType.value === 'text' && isRunnable(props.activeTab)
)
const useDocumentWorkspaceTab = computed(() => (
  !!props.activeTab
  && viewerType.value === 'text'
  && workspacePreviewState.value?.useWorkspace === true
))
const isCommentToolbarActive = computed(
  () => !!props.activeTab && commentsStore.isMarginVisible(props.activeTab)
)
const commentToolbarBadgeCount = computed(() =>
  props.activeTab ? commentsStore.unresolvedCount(props.activeTab) : 0
)
const toolbarUiState = computed(() => {
  if (workflowUiState.value) return workflowUiState.value
  if (showCommentToolbar.value) return { kind: 'text' }
  return null
})

const editorContainerRef = ref(null)

function redirectLegacySurfaceTab(path) {
  if (!path) return
  if (isLibraryPath(path)) {
    workspace.openLibrarySurface()
  } else if (isAiWorkbenchPath(path)) {
    workspace.openAiSurface()
  } else {
    return
  }

  queueMicrotask(() => {
    editorStore.closeTab(props.paneId, path)
  })
}

watch(
  () => props.activeTab,
  (path) => {
    if (!path) return
    redirectLegacySurfaceTab(path)
  },
  { immediate: true }
)

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
  documentPreviewState,
  showDocumentHeader,
  workflowUiState,
  workspacePreviewState,
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
  handleWorkflowRevealPdf,
  handleWorkflowDiagnoseWithAi,
  handleWorkflowFixWithAi,
} = useEditorPaneWorkflow({
  paneIdRef,
  tabsRef,
  activeTabRef,
  viewerTypeRef,
  editorStore,
  filesStore,
  workspace,
  latexStore,
  typstStore,
  toastStore,
  workflowStore,
  referencesStore,
  t,
})

const documentWorkspaceRoute = computed(() => resolveDocumentWorkspaceTextRoute({
  activeTab: props.activeTab,
  viewerType: viewerType.value,
  documentPreviewState: documentPreviewState.value,
}))

function selectTab(path) {
  editorStore.setActiveTab(props.paneId, path)
}

async function closeTab(path) {
  const result = await confirmUnsavedChanges([path])
  if (result.choice === 'cancel') return

  // Auto-save chat sessions on tab close
  if (isChatTab(path)) {
    const sid = getChatSessionId(path)
    if (sid) {
      const chatStore = await resolveChatStore()
      await chatStore.saveSession(sid)
    }
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

async function closePane() {
  const pane = editorStore.findPane(editorStore.paneTree, props.paneId)
  if (!pane) return
  const result = await confirmUnsavedChanges(pane.tabs || [], {
    message: t('These files have unsaved changes and will be closed with this pane.'),
  })
  if (result.choice === 'cancel') return

  for (const tab of pane.tabs || []) {
    workflowStore.handlePreviewClosed(tab)
  }

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

function toggleCommentToolbar() {
  if (!props.activeTab || viewerType.value !== 'text') return
  commentsStore.toggleMargin(props.activeTab)
}

defineExpose({ startComment })
</script>

<style scoped>
.editor-pane-surface {
  background: var(--bg-primary);
}

.document-header-stack {
  --document-header-row-height: 24px;
  flex: none;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 4;
  width: 100%;
  box-sizing: border-box;
  background: var(--bg-primary);
  border-bottom: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
}

.document-header-stack-subbar-only {
  border-bottom: 0;
}

.document-header-subbar {
  display: flex;
  width: 100%;
  height: var(--document-header-row-height);
  min-width: 0;
  box-sizing: border-box;
  min-height: 0;
  border-top: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  background: var(--bg-primary);
  overflow: visible;
}

.document-header-subbar-standalone {
  border-top: 0;
}
</style>
