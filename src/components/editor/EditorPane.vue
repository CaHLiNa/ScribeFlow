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
        @primary-action="handleWorkflowPrimaryAction"
        @reveal-preview="handleWorkflowRevealPreview"
        @reveal-pdf="handleWorkflowRevealPdf"
      />

      <Teleport v-if="showIntegratedDocumentTitle" :to="integratedDocumentTitleTarget">
        <div ref="documentTitleWrapRef" class="document-title-wrap document-title-wrap--rail">
          <div class="document-title-cluster">
            <button
              type="button"
              class="document-title-button document-title-button--rail"
              :title="currentDocumentLabel"
              :aria-label="currentDocumentLabel"
              :aria-expanded="tabsMenuOpen ? 'true' : 'false'"
              data-window-drag-ignore="true"
              @click="toggleTabsMenu"
            >
              <span class="document-title-label">{{ currentDocumentLabel }}</span>
              <svg
                class="document-title-chevron"
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                aria-hidden="true"
              >
                <path d="M4.5 6.5 8 10l3.5-3.5" />
              </svg>
            </button>
          </div>

          <div
            v-if="tabsMenuOpen"
            class="document-tabs-menu document-tabs-menu--rail"
            data-window-drag-ignore="true"
          >
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
                  <span class="document-tabs-menu-glyph" aria-hidden="true">
                    <svg
                      v-if="tab === activeTab"
                      class="document-tabs-menu-check"
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M2.25 6.1 4.8 8.6 9.75 3.6" />
                    </svg>
                  </span>
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
                    class="document-tabs-menu-close-icon"
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    aria-hidden="true"
                  >
                    <path d="M2.5 2.5 9.5 9.5M9.5 2.5l-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            <div class="document-tabs-menu-separator"></div>

            <button type="button" class="document-tabs-menu-create" @click="createTabFromMenu">
              <svg
                class="document-tabs-menu-create-icon"
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                aria-hidden="true"
              >
                <path d="M8 3v10M3 8h10" />
              </svg>
              <span class="document-tabs-menu-command-label">{{ t('New Tab') }}</span>
            </button>
          </div>
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
                  class="document-title-chevron"
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
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
                    <span class="document-tabs-menu-glyph" aria-hidden="true">
                      <svg
                        v-if="tab === activeTab"
                        class="document-tabs-menu-check"
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M2.25 6.1 4.8 8.6 9.75 3.6" />
                      </svg>
                    </span>
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
                      class="document-tabs-menu-close-icon"
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      aria-hidden="true"
                    >
                      <path d="M2.5 2.5 9.5 9.5M9.5 2.5l-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              <div class="document-tabs-menu-separator"></div>

              <button type="button" class="document-tabs-menu-create" @click="createTabFromMenu">
                <svg
                  class="document-tabs-menu-create-icon"
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  aria-hidden="true"
                >
                  <path d="M8 3v10M3 8h10" />
                </svg>
                <span class="document-tabs-menu-command-label">{{ t('New Tab') }}</span>
              </button>
            </div>
          </div>

          <div class="document-header-tools">
            <DocumentWorkflowBar
              v-if="showInlineWorkflowBar"
              :ui-state="toolbarUiState"
              :preview-state="workspacePreviewState"
              :status-text="workflowStatusText"
              :status-tone="workflowStatusTone"
              @primary-action="handleWorkflowPrimaryAction"
              @reveal-preview="handleWorkflowRevealPreview"
              @reveal-pdf="handleWorkflowRevealPdf"
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
            <PdfArtifactPreview
              v-else-if="documentWorkspaceRoute.previewMode === 'pdf-artifact'"
              :key="`workspace-pdf-artifact:${activeTab}:${documentWorkspaceRoute.previewTargetPath}`"
              :paneId="paneId"
              :artifactPath="documentWorkspaceRoute.previewTargetPath"
              :sourcePath="activeTab"
              :kind="toolbarUiState?.kind || 'document'"
              @open-external="handleWorkflowOpenExternalPdf"
            />
          </template>
          <template #source>
            <div v-if="showWorkspaceSourceWorkflowBar" class="workspace-source-stack">
              <div class="workspace-source-toolbar">
                <DocumentWorkflowBar
                  :ui-state="toolbarUiState"
                  :preview-state="workspacePreviewState"
                  :status-text="workflowStatusText"
                  :status-tone="workflowStatusTone"
                  @primary-action="handleWorkflowPrimaryAction"
                  @reveal-preview="handleWorkflowRevealPreview"
                  @reveal-pdf="handleWorkflowRevealPdf"
                />
              </div>
              <EditorTextWorkspaceSurface
                :filePath="activeTab"
                :paneId="paneId"
                @cursor-change="(pos) => $emit('cursor-change', pos)"
                @editor-stats="(stats) => $emit('editor-stats', stats)"
                @selection-change="(selection) => $emit('selection-change', selection)"
              />
            </div>
          </template>
        </EditorTextRouteSurface>
        <UnsupportedFilePane
          v-else-if="activeTab && viewerType === 'unsupported-binary'"
          :key="activeTab"
          :filePath="activeTab"
        />
        <PdfArtifactPreview
          v-else-if="activeTab && viewerType === 'pdf'"
          :key="`pdf:${activeTab}`"
          :paneId="paneId"
          :artifactPath="activeTab"
          :sourcePath="activeTab"
          kind="pdf"
          @open-external="handleOpenExternalPdf"
        />
        <MarkdownPreview
          v-else-if="activeTab && viewerType === 'markdown-preview'"
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
  isNewTab,
  isPreviewPath,
  previewSourcePathFromPath,
} from '../../utils/fileTypes'
import { useLatexStore } from '../../stores/latex'
import { useI18n } from '../../i18n'
import { useEditorPaneWorkflow } from '../../composables/useEditorPaneWorkflow'
import { openLocalPath } from '../../services/localFileOpen'
import { confirmUnsavedChanges } from '../../services/unsavedChanges'
import { resolveDocumentWorkspaceTextRoute } from '../../domains/document/documentWorkspacePreviewRuntime'
import { shouldShowIntegratedDocumentTitle } from '../../domains/editor/paneChromeRuntime'

const EditorTextRouteSurface = defineAsyncComponent(() => import('./EditorTextRouteSurface.vue'))
const UnsupportedFilePane = defineAsyncComponent(() => import('./UnsupportedFilePane.vue'))
const MarkdownPreview = defineAsyncComponent(() => import('./MarkdownPreview.vue'))
const PdfArtifactPreview = defineAsyncComponent(() => import('./PdfArtifactPreview.vue'))
const DocumentWorkflowBar = defineAsyncComponent(() => import('./DocumentWorkflowBar.vue'))
const NewTab = defineAsyncComponent(() => import('./NewTab.vue'))
const EmptyPane = defineAsyncComponent(() => import('./EmptyPane.vue'))
const EditorTextWorkspaceSurface = defineAsyncComponent(
  () => import('./EditorTextWorkspaceSurface.vue')
)

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
const hasSinglePane = computed(() => countLeafPanes(editorStore.paneTree) <= 1)
const toolbarUiState = computed(() => {
  if (workflowUiState.value) return workflowUiState.value
  if (props.activeTab && viewerType.value === 'text') return { kind: 'text' }
  return null
})
const showIntegratedDocumentTitle = computed(() =>
  shouldShowIntegratedDocumentTitle({
    hasIntegratedDocumentTitle: hasIntegratedDocumentTitle.value,
    activeTab: props.activeTab,
    isActive: isActive.value,
    hasSinglePane: hasSinglePane.value,
    isSettingsSurface: workspace.isSettingsSurface,
  })
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
  () =>
    !!toolbarUiState.value &&
    !showIntegratedWorkflowBar.value &&
    !documentWorkspaceRoute.value.useWorkspaceSurface
)
const showWorkspaceSourceWorkflowBar = computed(
  () => !!toolbarUiState.value && documentWorkspaceRoute.value.useWorkspaceSurface
)
const showLocalDocumentHeader = computed(
  () => showPaneDocumentTitle.value || showInlineWorkflowBar.value
)
const showPaneDocumentTitle = computed(() => !!props.activeTab && !hasIntegratedDocumentTitle.value)

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
  handleWorkflowPrimaryAction,
  handleWorkflowRevealPreview,
  handleWorkflowRevealPdf,
  handleWorkflowOpenExternalPdf,
} = useEditorPaneWorkflow({
  paneIdRef,
  tabsRef,
  activeTabRef,
  viewerTypeRef,
  editorStore,
  filesStore,
  workspace,
  latexStore,
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

function countLeafPanes(node) {
  if (!node) return 0
  if (node.type === 'leaf') return 1
  return (node.children || []).reduce((total, child) => total + countLeafPanes(child), 0)
}

function handleOpenExternalPdf() {
  if (!props.activeTab || viewerType.value !== 'pdf') return
  void openLocalPath(props.activeTab)
}

async function closeTab(path) {
  const result = await confirmUnsavedChanges([path])
  if (result.choice === 'cancel') return
  workflowStore.handlePreviewClosed(path)
  editorStore.closeTab(props.paneId, path)
}

function toggleTabsMenu() {
  if (!props.activeTab) return
  if (tabsMenuOpen.value) {
    closeTabsMenu()
    return
  }
  tabsMenuOpen.value = true
}

function createTabFromMenu() {
  closeTabsMenu()
  openNewTabDirect()
}

function closeTabsMenu() {
  tabsMenuOpen.value = false
}

function selectTabFromMenu(path) {
  selectTab(path)
  closeTabsMenu()
}

async function closeTabFromMenu(path) {
  closeTabsMenu()
  if (!path) return
  await closeTab(path)
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

.workspace-source-stack {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--shell-editor-surface);
}

.workspace-source-toolbar {
  --document-header-row-height: 31px;
  flex: none;
  display: flex;
  align-items: center;
  min-height: 31px;
  padding: 0 12px;
  border-bottom: 1px solid var(--workbench-divider-soft);
  background: var(--shell-editor-surface);
}

.document-header-stack {
  --document-header-row-height: 31px;
  flex: none;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 4;
  width: 100%;
  box-sizing: border-box;
  padding: 1px 12px 2px;
  background: transparent;
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
  gap: 4px;
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

.document-title-wrap--rail {
  justify-content: center;
  flex: 0 1 auto;
  width: auto;
  max-width: 100%;
}

.document-title-cluster {
  display: inline-flex;
  align-items: center;
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
  font-size: var(--workbench-font-primary);
  font-weight: var(--workbench-weight-medium);
  letter-spacing: -0.015em;
  cursor: pointer;
  transition:
    background-color 140ms ease,
    color 140ms ease;
}

.document-title-button:hover {
  background: color-mix(in srgb, var(--surface-hover) 18%, transparent);
}

.document-title-button--pane {
  min-height: 24px;
  padding: 0 6px;
  border-radius: 6px;
  color: color-mix(in srgb, var(--text-secondary) 84%, transparent);
  font-size: var(--workbench-font-primary);
  font-weight: var(--workbench-weight-medium);
  letter-spacing: -0.005em;
}

.editor-pane-shell:not([data-pane-id='pane-root']) .document-title-button--pane {
  color: var(--text-secondary);
}

.editor-pane-shell[data-pane-id='pane-root'] .document-title-button--pane {
  color: color-mix(in srgb, var(--text-secondary) 86%, transparent);
  font-size: var(--workbench-font-primary);
  font-weight: var(--workbench-weight-medium);
}

.document-title-button--pane:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--surface-hover) 7%, transparent);
}

.document-title-button--rail {
  min-height: 26px;
  padding: 0 8px;
  border-radius: 8px;
  color: color-mix(in srgb, var(--text-primary) 92%, transparent);
  font-size: var(--workbench-font-title);
  font-weight: var(--workbench-weight-strong);
  letter-spacing: -0.003em;
}

.document-title-button--rail:hover {
  background: color-mix(in srgb, var(--surface-hover) 10%, transparent);
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
  width: 14px;
  height: 14px;
  color: var(--text-muted);
}

.document-tabs-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  width: min(242px, calc(100vw - 32px));
  padding: 4px;
  border-radius: 11px;
  background: color-mix(in srgb, var(--surface-base) 97%, var(--panel-surface));
  box-shadow:
    0 18px 40px color-mix(in srgb, black 14%, transparent),
    0 3px 10px color-mix(in srgb, black 6%, transparent),
    inset 0 0 0 1px color-mix(in srgb, white 8%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--border) 12%, transparent);
  backdrop-filter: blur(22px) saturate(1.05);
}

.document-tabs-menu--rail {
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
}

.document-tabs-menu-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: min(320px, 48vh);
  overflow: auto;
}

.document-tabs-menu-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 2px;
}

.document-tabs-menu-select {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}

.document-tabs-menu-select {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) auto;
  column-gap: 8px;
  align-items: center;
  width: 100%;
  min-height: 26px;
  padding: 0 8px 0 10px;
  color: color-mix(in srgb, var(--text-secondary) 92%, transparent);
  cursor: pointer;
  border-radius: 7px;
  transition:
    background-color 140ms ease,
    color 140ms ease;
}

.document-tabs-menu-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  color: color-mix(in srgb, var(--text-secondary) 88%, transparent);
  font-size: var(--workbench-font-secondary);
}

.document-tabs-menu-check {
  width: 12px;
  height: 12px;
}

.document-tabs-menu-item.is-active .document-tabs-menu-select {
  color: var(--text-primary);
  font-weight: var(--workbench-weight-strong);
}

.document-tabs-menu-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-tabs-menu-dirty {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--accent);
  flex: 0 0 auto;
  margin-left: 10px;
  opacity: 0.94;
}

.document-tabs-menu-select:hover {
  background: color-mix(in srgb, var(--surface-hover) 12%, transparent);
  color: var(--text-primary);
}

.document-tabs-menu-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-right: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: color-mix(in srgb, var(--text-secondary) 88%, transparent);
  cursor: pointer;
  transition:
    background-color 140ms ease,
    color 140ms ease;
}

.document-tabs-menu-close:hover {
  background: color-mix(in srgb, var(--surface-hover) 12%, transparent);
  color: var(--text-primary);
}

.document-tabs-menu-close-icon {
  width: 12px;
  height: 12px;
}

.document-tabs-menu-separator {
  height: 1px;
  margin: 4px 6px;
  background: color-mix(in srgb, var(--border-subtle) 44%, transparent);
}

.document-tabs-menu-create {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: color-mix(in srgb, var(--text-secondary) 92%, transparent);
  font: inherit;
  cursor: pointer;
  transition:
    background-color 140ms ease,
    color 140ms ease;
}

.document-tabs-menu-create:hover {
  background: color-mix(in srgb, var(--surface-hover) 12%, transparent);
  color: var(--text-primary);
}

.document-tabs-menu-create-icon {
  width: 12px;
  height: 12px;
  opacity: 0.86;
}

.document-tabs-menu-command-label {
  min-width: 0;
  text-align: left;
}

.document-header-tools :deep(.workflow-bar) {
  flex: 0 0 auto;
  margin-left: 0;
}
</style>
