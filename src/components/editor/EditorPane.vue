<template>
  <div
    class="editor-pane-shell h-full w-full min-w-0"
    :data-pane-id="paneId"
    :class="{ 'is-active': isActive }"
    @mousedown="editorStore.setActivePane(paneId)"
  >
    <div class="editor-pane-card">
      <DocumentWorkflowBar
        v-if="showIntegratedWorkflowBar"
        :teleportTo="integratedWorkflowTarget"
        :shellIntegrated="showIntegratedWorkflowBar"
        :ui-state="toolbarUiState"
        :preview-state="workspacePreviewState"
        :status-text="workflowStatusText"
        :status-tone="workflowStatusTone"
        :show-run-buttons="showToolbarRunButtons"
        @primary-action="handleWorkflowPrimaryAction"
        @reveal-preview="handleWorkflowRevealPreview"
        @reveal-pdf="handleWorkflowRevealPdf"
        @run-code="handleRunCode"
        @run-file="handleRunFile"
      />

      <Teleport v-if="showIntegratedDocumentTitle" :to="integratedDocumentTitleTarget">
        <div class="workbench-document-title" :title="currentDocumentLabel" :aria-label="currentDocumentLabel">
          <span class="workbench-document-title-label">{{ currentDocumentLabel }}</span>
        </div>
      </Teleport>

      <div v-if="showLocalDocumentHeader" class="document-header-stack">
        <div class="document-header-row">
          <div
            v-if="showPaneDocumentTitle"
            ref="documentTitleWrapRef"
            class="document-title-wrap document-title-wrap--pane"
          >
            <div class="document-title-cluster">
              <button
                type="button"
                class="document-title-button document-title-button--pane"
                :title="currentDocumentLabel"
                :aria-label="currentDocumentLabel"
                :aria-expanded="tabsMenuOpen ? 'true' : 'false'"
                @click="toggleTabsMenu"
              >
                <span class="document-title-label">{{ currentDocumentLabel }}</span>
                <svg
                  v-if="tabs.length > 1"
                  class="document-title-chevron"
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  aria-hidden="true"
                >
                  <path d="M4.5 6.5 8 10l3.5-3.5" />
                </svg>
              </button>
            </div>

            <div v-if="tabsMenuOpen" class="document-tabs-menu">
              <div class="document-tabs-menu-list">
                <div
                  v-for="tab in tabs"
                  :key="tab"
                  class="document-tabs-menu-item"
                  :class="{ 'is-active': tab === activeTab }"
                >
                  <button
                    type="button"
                    class="document-tabs-menu-select"
                    @click="selectTabFromMenu(tab)"
                  >
                    <span class="document-tabs-menu-label">{{ fileName(tab) }}</span>
                    <span
                      v-if="editorStore.dirtyFiles.has(tab)"
                      class="document-tabs-menu-dirty"
                      aria-hidden="true"
                    ></span>
                  </button>
                  <button
                    type="button"
                    class="document-tabs-menu-close"
                    :title="t('Close tab')"
                    :aria-label="t('Close tab')"
                    @click.stop="closeTabFromMenu(tab)"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                    >
                      <path d="M2 2l6 6M8 2l-6 6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="document-header-tools">
            <div v-if="activeTab" class="document-pane-actions">
              <button
                type="button"
                class="document-pane-action"
                :title="t('New Tab')"
                :aria-label="t('New Tab')"
                @click.stop="openNewTabDirect"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  aria-hidden="true"
                >
                  <path d="M8 3v10M3 8h10" />
                </svg>
              </button>
            </div>

            <DocumentWorkflowBar
              v-if="showInlineWorkflowBar"
              inline-header
              :ui-state="toolbarUiState"
              :preview-state="workspacePreviewState"
              :status-text="workflowStatusText"
              :status-tone="workflowStatusTone"
              :show-run-buttons="showToolbarRunButtons"
              @primary-action="handleWorkflowPrimaryAction"
              @reveal-preview="handleWorkflowRevealPreview"
              @reveal-pdf="handleWorkflowRevealPdf"
              @run-code="handleRunCode"
              @run-file="handleRunFile"
            />
          </div>
        </div>
      </div>

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
          @cursor-change="(pos) => $emit('cursor-change', pos)"
          @editor-stats="(stats) => $emit('editor-stats', stats)"
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
import { computed, ref, toRef, defineAsyncComponent, onMounted, onUnmounted } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useFilesStore } from '../../stores/files'
import { useWorkspaceStore } from '../../stores/workspace'
import { useToastStore } from '../../stores/toast'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import {
  getViewerType,
  isRunnable,
  isNewTab,
  isPreviewPath,
  previewSourcePathFromPath,
} from '../../utils/fileTypes'
import { useLatexStore } from '../../stores/latex'
import { useTypstStore } from '../../stores/typst'
import { useI18n } from '../../i18n'
import { useEditorPaneWorkflow } from '../../composables/useEditorPaneWorkflow'
import { confirmUnsavedChanges } from '../../services/unsavedChanges'
import { resolveDocumentWorkspaceTextRoute } from '../../domains/document/documentWorkspacePreviewRuntime'

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
const workflowStore = useDocumentWorkflowStore()
const { t } = useI18n()
const paneIdRef = toRef(props, 'paneId')
const tabsRef = toRef(props, 'tabs')
const activeTabRef = toRef(props, 'activeTab')

const isActive = computed(() => editorStore.activePaneId === props.paneId)
const hasIntegratedDocumentTitle = computed(() => !!props.topbarTabsTargetSelector)
const hasIntegratedWorkflowBar = computed(() => !!props.topbarWorkflowTargetSelector)
const viewerType = computed(() => (props.activeTab ? getViewerType(props.activeTab) : null))
const viewerTypeRef = viewerType
const showToolbarRunButtons = computed(
  () => !!props.activeTab && viewerType.value === 'text' && isRunnable(props.activeTab)
)
const toolbarUiState = computed(() => {
  if (workflowUiState.value) return workflowUiState.value
  if (props.activeTab && viewerType.value === 'text') return { kind: 'text' }
  return null
})
const showIntegratedDocumentTitle = computed(
  () => hasIntegratedDocumentTitle.value && isActive.value && !!props.activeTab
)
const integratedDocumentTitleTarget = computed(() =>
  showIntegratedDocumentTitle.value ? props.topbarTabsTargetSelector : ''
)
const showIntegratedWorkflowBar = computed(
  () => hasIntegratedWorkflowBar.value && isActive.value && !!toolbarUiState.value
)
const integratedWorkflowTarget = computed(() =>
  showIntegratedWorkflowBar.value ? props.topbarWorkflowTargetSelector : ''
)
const showInlineWorkflowBar = computed(
  () => !!toolbarUiState.value && !showIntegratedWorkflowBar.value
)
const showLocalDocumentHeader = computed(() => !!props.activeTab || showInlineWorkflowBar.value)
const isSplitPane = computed(() => editorStore.paneTree?.type === 'split')
const showPaneDocumentTitle = computed(() => !!props.activeTab)

const editorContainerRef = ref(null)
const documentTitleWrapRef = ref(null)
const tabsMenuOpen = ref(false)
const currentDocumentLabel = computed(() => fileName(props.activeTab))

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

function fileName(path) {
  if (!path) return ''
  if (isNewTab(path)) return t('New Tab')
  if (isPreviewPath(path)) {
    const source = previewSourcePathFromPath(path)
    return source.split('/').pop() || t('Preview')
  }
  return path.split('/').pop() || path
}

async function closeTab(path) {
  const result = await confirmUnsavedChanges([path])
  if (result.choice === 'cancel') return
  workflowStore.handlePreviewClosed(path)
  editorStore.closeTab(props.paneId, path)
}

function toggleTabsMenu() {
  if (props.tabs.length <= 1) return
  tabsMenuOpen.value = !tabsMenuOpen.value
}

function closeTabsMenu() {
  tabsMenuOpen.value = false
}

function selectTabFromMenu(path) {
  selectTab(path)
  closeTabsMenu()
}

async function closeTabFromMenu(path) {
  await closeTab(path)
  if ((props.tabs || []).length <= 1) {
    closeTabsMenu()
  }
}

function openNewTabDirect() {
  editorStore.openNewTab(props.paneId)
}

function handleDocumentPointerDown(event) {
  if (!tabsMenuOpen.value) return
  if (documentTitleWrapRef.value?.contains(event.target)) return
  closeTabsMenu()
}

function handleDocumentEscape(event) {
  if (event.key === 'Escape') {
    closeTabsMenu()
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentEscape)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentEscape)
})
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
  --document-header-row-height: 28px;
  flex: none;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 4;
  width: 100%;
  box-sizing: border-box;
  padding: 1px 10px 2px;
  background: transparent;
}

.workbench-document-title {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  min-width: 0;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--chrome-surface) 54%, transparent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--border) 20%, transparent),
    0 1px 0 color-mix(in srgb, white 24%, transparent);
  color: var(--text-primary);
  font-size: var(--ui-font-body);
  font-weight: 600;
  letter-spacing: -0.015em;
}

.workbench-document-title-label {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-header-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--document-header-row-height);
  min-width: 0;
  justify-content: space-between;
}

.document-header-tools {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.document-title-wrap {
  position: relative;
  display: flex;
  justify-content: center;
  flex: 1 1 0;
  width: auto;
  min-width: 0;
}

.document-title-wrap--pane {
  justify-content: flex-start;
}

.document-title-cluster {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
}

.document-title-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  max-width: 100%;
  min-height: var(--document-header-row-height);
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: var(--ui-font-body);
  font-weight: 600;
  letter-spacing: -0.015em;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}

.document-title-button:hover {
  background: color-mix(in srgb, var(--surface-hover) 18%, transparent);
}

.document-title-button--pane {
  min-height: 24px;
  padding: 0 6px;
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: var(--sidebar-font-item);
  font-weight: 560;
  letter-spacing: -0.01em;
}

.editor-pane-shell:not([data-pane-id='pane-root']) .document-title-button--pane {
  color: var(--text-secondary);
}

.editor-pane-shell[data-pane-id='pane-root'] .document-title-button--pane {
  color: color-mix(in srgb, var(--text-secondary) 86%, transparent);
  font-size: var(--sidebar-font-body);
  font-weight: 540;
}

.document-title-button--pane:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--surface-hover) 14%, transparent);
}

.document-title-label {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-title-chevron {
  flex: 0 0 auto;
  color: var(--text-muted);
}

.document-pane-actions {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: 0 0 auto;
}

.document-pane-actions--leading {
  min-width: 64px;
}

.document-pane-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}

.document-pane-action:hover {
  background: color-mix(in srgb, var(--surface-hover) 18%, transparent);
  color: var(--text-primary);
}

.document-tabs-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  z-index: 30;
  width: min(280px, calc(100vw - 32px));
  transform: translateX(-50%);
  padding: 4px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-base) 96%, var(--panel-surface));
  box-shadow:
    0 14px 32px color-mix(in srgb, black 14%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--border) 16%, transparent);
  backdrop-filter: blur(20px) saturate(1.04);
}

.document-tabs-menu-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: min(320px, 48vh);
  overflow: auto;
}

.document-tabs-menu-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 2px;
  border-radius: 7px;
}

.document-tabs-menu-item.is-active {
  background: color-mix(in srgb, var(--surface-hover) 28%, transparent);
}

.document-tabs-menu-select,
.document-tabs-menu-close {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}

.document-tabs-menu-select {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 28px;
  padding: 0 8px;
  color: var(--text-secondary);
  cursor: pointer;
}

.document-tabs-menu-item.is-active .document-tabs-menu-select {
  color: var(--text-primary);
}

.document-tabs-menu-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-tabs-menu-dirty {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--accent);
  flex: 0 0 auto;
}

.document-tabs-menu-close {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 140ms ease,
    background-color 140ms ease,
    color 140ms ease;
}

.document-tabs-menu-item:hover .document-tabs-menu-close,
.document-tabs-menu-item.is-active .document-tabs-menu-close {
  opacity: 1;
}

.document-tabs-menu-close:hover,
.document-tabs-menu-select:hover {
  color: var(--text-primary);
}

.document-tabs-menu-close:hover {
  background: color-mix(in srgb, var(--surface-hover) 22%, transparent);
}

.document-header-tools :deep(.workflow-bar) {
  flex: 0 0 auto;
  margin-left: 0;
}
</style>
