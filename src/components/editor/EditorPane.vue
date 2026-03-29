<template>
  <div
    class="editor-pane-shell h-full w-full min-w-0"
    :data-pane-id="paneId"
    :class="{ 'is-active': isActive }"
    @mousedown="editorStore.setActivePane(paneId)"
  >
    <div class="editor-pane-card">
      <!-- Tab bar -->
      <TabBar
        v-if="showTabBar"
        :tabs="tabs"
        :activeTab="activeTab"
        :paneId="paneId"
        :teleportTo="integratedTabBarTarget"
        :shellIntegrated="showIntegratedTabBar"
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

      <DocumentWorkflowBar
        v-if="showIntegratedWorkflowBar"
        :teleportTo="integratedWorkflowTarget"
        :shellIntegrated="showIntegratedWorkflowBar"
        :ui-state="toolbarUiState"
        :preview-state="workspacePreviewState"
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
        @toggle-comments="toggleCommentToolbar"
      />

      <div v-if="showLocalDocumentHeader" class="document-header-stack">
        <DocumentWorkflowBar
          v-if="showInlineWorkflowBar"
          :ui-state="toolbarUiState"
          :preview-state="workspacePreviewState"
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
          @toggle-comments="toggleCommentToolbar"
        />
      </div>

      <!-- Editor or empty state -->
      <div
        class="editor-pane-surface flex-1 overflow-hidden relative w-full min-w-0"
        :class="{
          'flex flex-col': viewerType === 'text' && !documentWorkspaceRoute.useWorkspaceSurface,
        }"
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
          </template>
        </EditorTextRouteSurface>
        <UnsupportedFilePane
          v-else-if="activeTab && viewerType === 'unsupported-binary'"
          :key="activeTab"
          :filePath="activeTab"
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
        <NewTab
          v-else-if="activeTab && viewerType === 'newtab'"
          :key="activeTab"
          :paneId="paneId"
        />
        <EmptyPane v-else-if="!activeTab" :paneId="paneId" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, toRef, defineAsyncComponent } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useFilesStore } from '../../stores/files'
import { useWorkspaceStore } from '../../stores/workspace'
import { useToastStore } from '../../stores/toast'
import { useCommentsStore } from '../../stores/comments'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { getViewerType, isRunnable } from '../../utils/fileTypes'
import { useLatexStore } from '../../stores/latex'
import { useTypstStore } from '../../stores/typst'
import { useI18n } from '../../i18n'
import { useEditorPaneComments } from '../../composables/useEditorPaneComments'
import { useEditorPaneWorkflow } from '../../composables/useEditorPaneWorkflow'
import { confirmUnsavedChanges } from '../../services/unsavedChanges'
import { resolveDocumentWorkspaceTextRoute } from '../../domains/document/documentWorkspacePreviewRuntime'
import TabBar from './TabBar.vue'
const EditorTextRouteSurface = defineAsyncComponent(() => import('./EditorTextRouteSurface.vue'))
const UnsupportedFilePane = defineAsyncComponent(() => import('./UnsupportedFilePane.vue'))
const MarkdownPreview = defineAsyncComponent(() => import('./MarkdownPreview.vue'))
const TypstNativePreview = defineAsyncComponent(() => import('./TypstNativePreview.vue'))
const DocumentWorkflowBar = defineAsyncComponent(() => import('./DocumentWorkflowBar.vue'))
const NewTab = defineAsyncComponent(() => import('./NewTab.vue'))
const EmptyPane = defineAsyncComponent(() => import('./EmptyPane.vue'))

const props = defineProps({
  paneId: { type: String, required: true },
  tabs: { type: Array, default: () => [] },
  activeTab: { type: String, default: null },
  topbarTabsTargetSelector: { type: String, default: '' },
  topbarWorkflowTargetSelector: { type: String, default: '' },
})

const editorStore = useEditorStore()
const filesStore = useFilesStore()
const workspace = useWorkspaceStore()
const latexStore = useLatexStore()
const typstStore = useTypstStore()
const toastStore = useToastStore()
const commentsStore = useCommentsStore()
const workflowStore = useDocumentWorkflowStore()
const { t } = useI18n()
const paneIdRef = toRef(props, 'paneId')
const tabsRef = toRef(props, 'tabs')
const activeTabRef = toRef(props, 'activeTab')

const isActive = computed(() => editorStore.activePaneId === props.paneId)
const hasIntegratedTabBar = computed(() => !!props.topbarTabsTargetSelector)
const showIntegratedTabBar = computed(() => hasIntegratedTabBar.value && isActive.value)
const showInlineTabBar = computed(() => !hasIntegratedTabBar.value)
const showTabBar = computed(
  () => props.tabs.length > 0 && (showIntegratedTabBar.value || showInlineTabBar.value)
)
const integratedTabBarTarget = computed(() =>
  showIntegratedTabBar.value ? props.topbarTabsTargetSelector : ''
)
const hasIntegratedWorkflowBar = computed(() => !!props.topbarWorkflowTargetSelector)
const viewerType = computed(() => (props.activeTab ? getViewerType(props.activeTab) : null))
const viewerTypeRef = viewerType
const showCommentToolbar = computed(() => !!props.activeTab && viewerType.value === 'text')
const showToolbarRunButtons = computed(
  () => !!props.activeTab && viewerType.value === 'text' && isRunnable(props.activeTab)
)
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
const showIntegratedWorkflowBar = computed(
  () => hasIntegratedWorkflowBar.value && isActive.value && !!toolbarUiState.value
)
const integratedWorkflowTarget = computed(() =>
  showIntegratedWorkflowBar.value ? props.topbarWorkflowTargetSelector : ''
)
const showInlineWorkflowBar = computed(
  () => !!toolbarUiState.value && !showIntegratedWorkflowBar.value
)
const showLocalDocumentHeader = computed(() => showInlineWorkflowBar.value)

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
  documentPreviewState,
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
  t,
})

const documentWorkspaceRoute = computed(() =>
  resolveDocumentWorkspaceTextRoute({
    activeTab: props.activeTab,
    viewerType: viewerType.value,
    documentPreviewState: documentPreviewState.value,
  })
)

function selectTab(path) {
  editorStore.setActiveTab(props.paneId, path)
}

async function closeTab(path) {
  const result = await confirmUnsavedChanges([path])
  if (result.choice === 'cancel') return
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
.editor-pane-shell {
  height: 100%;
  padding: 0;
  background: transparent;
}

.editor-pane-card {
  display: flex;
  height: 100%;
  min-height: 0;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.editor-pane-surface {
  background: transparent;
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
  background: transparent;
}

</style>
