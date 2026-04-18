<template>
  <div
    class="app-shell-root flex flex-col h-screen w-screen overflow-hidden"
    :class="{
      'is-left-resizing': isLeftSidebarResizing,
      'is-right-resizing': isRightSidebarResizing,
      'is-shell-resizing': isLeftSidebarResizing || isRightSidebarResizing,
      'is-mac-vibrant': isMacDesktop && workspace.isOpen,
    }"
  >
    <div class="app-shell-workspace flex flex-1 flex-col overflow-hidden">
      <WorkbenchRail
        v-if="workspace.isOpen"
        class="app-shell-topbar shrink-0"
        :current-document-label="currentDocumentLabel"
        :prefer-external-document-title="
          workspace.isWorkspaceSurface && workspace.leftSidebarPanel !== 'references'
        "
        :show-document-title-target="workspace.leftSidebarPanel !== 'references'"
        :left-sidebar-available="workspace.isWorkspaceSurface"
        :left-sidebar-open="leftSidebarVisible"
        :left-sidebar-panel="workspace.leftSidebarPanel"
        :right-sidebar-open="workspace.rightSidebarOpen"
        :right-sidebar-panel="workspace.rightSidebarPanel"
        :split-pane-available="
          workspace.isWorkspaceSurface && workspace.leftSidebarPanel !== 'references'
        "
        :split-pane-open="splitPaneOpen"
        :inspector-available="supportsRightSidebar"
        @open-reference-library="toggleReferenceLibrary"
        @open-ai-agent="openAiAgent"
        @open-outline-inspector="openOutlineInspector"
        @toggle-left-sidebar="workspace.toggleLeftSidebar()"
        @toggle-split-pane="toggleSplitPane"
        @toggle-right-sidebar="workspace.toggleRightSidebar()"
      />

      <div class="app-shell-workbench flex flex-1 overflow-hidden">
        <div
          class="app-shell-region app-shell-region-left shrink-0 overflow-hidden"
          :class="{
            'is-open': leftSidebarVisible,
            'is-collapsed': !leftSidebarVisible,
            'is-resizing': isLeftSidebarResizing,
            'is-workspace-left-region': workspace.isWorkspaceSurface,
          }"
          :style="{
            width: leftSidebarVisible ? `${leftSidebarWidth}px` : '0px',
          }"
        >
          <div
            class="app-shell-sidebar app-shell-sidebar-left shrink-0 overflow-hidden"
            :class="{
              'is-open': leftSidebarVisible,
              'is-collapsed': !leftSidebarVisible,
              'is-resizing': isLeftSidebarResizing,
            }"
            data-sidebar="left"
            :aria-hidden="leftSidebarVisible ? 'false' : 'true'"
            :style="{
              width: '100%',
            }"
          >
            <KeepAlive :max="2">
              <LeftSidebar
                v-if="workspace.isWorkspaceSurface && workspace.isOpen"
                ref="leftSidebarRef"
                @open-settings="workspace.openSettings()"
                @open-folder="pickWorkspace"
                @open-workspace="openWorkspace"
                @close-folder="closeWorkspace"
              />
              <SettingsSidebar v-else-if="workspace.isSettingsSurface && workspace.isOpen" />
            </KeepAlive>
          </div>
        </div>

        <!-- Left resize handle -->
        <div
          class="app-shell-resize-slot"
          :class="{ 'is-visible': leftSidebarVisible, 'is-hidden': !leftSidebarVisible }"
        >
          <ResizeHandle
            class="app-shell-resize-handle app-shell-resize-handle-left"
            direction="vertical"
            @resize="onLeftResize"
            @resize-start="startLeftSidebarResize"
            @resize-end="endLeftSidebarResize"
          />
        </div>

        <div
          class="app-shell-region app-shell-region-main app-shell-main app-shell-main-shell flex-1 flex flex-col overflow-hidden"
        >
          <div
            class="app-shell-main-card flex-1 overflow-hidden relative"
            :class="{
              'has-left-sidebar': leftSidebarVisible,
              'has-right-sidebar': workspace.rightSidebarOpen && supportsRightSidebar,
              'is-empty-workspace-shell': !workspace.isOpen,
            }"
          >
            <KeepAlive :max="3">
              <component
                :is="activeWorkbenchComponent"
                :key="activeWorkbenchCacheKey"
                v-bind="activeWorkbenchProps"
                :class="activeWorkbenchClass"
                @cursor-change="onCursorChange"
                @selection-change="onSelectionChange"
              />
            </KeepAlive>
          </div>
        </div>

        <template v-if="supportsRightSidebar">
          <div
            class="app-shell-resize-slot"
            :class="{
              'is-visible': workspace.rightSidebarOpen,
              'is-hidden': !workspace.rightSidebarOpen,
            }"
          >
            <ResizeHandle
              class="app-shell-resize-handle app-shell-resize-handle-right"
              direction="vertical"
              @resize="onRightResize"
              @resize-start="startRightSidebarResize"
              @resize-end="endRightSidebarResize"
              @dblclick="onRightResizeSnap"
            />
          </div>

          <div
            class="app-shell-region app-shell-region-right shrink-0 overflow-hidden"
            :class="{
              'is-open': workspace.rightSidebarOpen,
              'is-collapsed': !workspace.rightSidebarOpen,
              'is-resizing': isRightSidebarResizing,
            }"
            data-sidebar="right"
            :aria-hidden="workspace.rightSidebarOpen ? 'false' : 'true'"
            :style="{
              width: workspace.rightSidebarOpen ? `${rightSidebarWidth}px` : '0px',
            }"
          >
            <RightSidebar class="app-shell-sidebar app-shell-sidebar-right" />
          </div>
        </template>
      </div>
    </div>

    <!-- Setup Wizard (first-time) -->
    <SetupWizard :visible="setupWizardVisible" @close="setupWizardVisible = false" />

    <!-- Toasts -->
    <ToastContainer />
  </div>
</template>

<script setup>
import { ref, computed, defineAsyncComponent } from 'vue'
import { useWorkspaceStore } from './stores/workspace'
import { useFilesStore } from './stores/files'
import { useEditorStore } from './stores/editor'
import { useDocumentWorkflowStore } from './stores/documentWorkflow'
import { useLinksStore } from './stores/links'
import { useLatexStore } from './stores/latex'
import { useReferencesStore } from './stores/references'
import { useAiStore } from './stores/ai'

import ResizeHandle from './components/layout/ResizeHandle.vue'
import WorkbenchRail from './components/layout/WorkbenchRail.vue'
import ToastContainer from './components/layout/ToastContainer.vue'
import { useI18n } from './i18n'
import {
  getReferenceSectionLabelKey,
  getReferenceSourceLabelKey,
} from './domains/references/referencePresentation.js'
import { useAppShellLayout } from './composables/useAppShellLayout'
import { useAppShellEventBridge } from './app/shell/useAppShellEventBridge'
import { applyAppWindowConstraints } from './app/shell/useAppWindowConstraints'
import { useAppTeardown } from './app/teardown/useAppTeardown'
import { useWorkspaceLifecycle } from './app/workspace/useWorkspaceLifecycle'
import { useBrowserPreviewRuntime } from './app/browserPreview/useBrowserPreviewRuntime'
import { confirmUnsavedChanges } from './services/unsavedChanges'
import { isNewTab, isPreviewPath, previewSourcePathFromPath } from './utils/fileTypes'
import { isMac } from './platform'

const LeftSidebar = defineAsyncComponent(() => import('./components/sidebar/LeftSidebar.vue'))
const RightSidebar = defineAsyncComponent(() => import('./components/sidebar/RightSidebar.vue'))
const SettingsSidebar = defineAsyncComponent(
  () => import('./components/settings/SettingsSidebar.vue')
)
const PaneContainer = defineAsyncComponent(() => import('./components/editor/PaneContainer.vue'))
const ReferenceLibraryWorkbench = defineAsyncComponent(
  () => import('./components/references/ReferenceLibraryWorkbench.vue')
)
const Settings = defineAsyncComponent(() => import('./components/settings/Settings.vue'))
const SetupWizard = defineAsyncComponent(() => import('./components/SetupWizard.vue'))

const workspace = useWorkspaceStore()
const filesStore = useFilesStore()
const editorStore = useEditorStore()
const workflowStore = useDocumentWorkflowStore()
const linksStore = useLinksStore()
const latexStore = useLatexStore()
const referencesStore = useReferencesStore()
const aiStore = useAiStore()
const { t } = useI18n()
const isMacDesktop = typeof window !== 'undefined' && isMac && !!window.__TAURI_INTERNALS__

void applyAppWindowConstraints()

const leftSidebarRef = ref(null)

const supportsRightSidebar = computed(() => workspace.isOpen && workspace.isWorkspaceSurface)
const leftSidebarVisible = computed(
  () => workspace.isOpen && (workspace.isSettingsSurface || workspace.leftSidebarOpen)
)
const splitPaneOpen = computed(
  () =>
    editorStore.paneTree?.type === 'split' &&
    Array.isArray(editorStore.paneTree.children) &&
    editorStore.paneTree.children.length === 2
)
const activeWorkbenchComponent = computed(() => {
  if (workspace.isSettingsSurface) return Settings
  if (workspace.leftSidebarPanel === 'references') return ReferenceLibraryWorkbench
  return PaneContainer
})
const activeWorkbenchCacheKey = computed(() => {
  if (workspace.isSettingsSurface) return 'settings'
  return `workspace:${workspace.leftSidebarPanel || 'files'}`
})
const activeWorkbenchProps = computed(() =>
  workspace.isSettingsSurface
    ? {}
    : workspace.leftSidebarPanel === 'references'
      ? {}
      : {
          node: editorStore.paneTree,
          topbarTabsTargetSelector: '#app-shell-topbar-document-title',
        }
)
const activeWorkbenchClass = computed(() => 'h-full min-h-0 w-full')
const currentDocumentLabel = computed(() => {
  if (workspace.isSettingsSurface) return ''
  if (workspace.leftSidebarPanel === 'references') {
    if (referencesStore.selectedCollection?.label) {
      return referencesStore.selectedCollection.label
    }
    if (referencesStore.selectedSourceKey) {
      const sourceKey =
        referencesStore.sourceSections.find(
          (section) => section.key === referencesStore.selectedSourceKey
        )?.key || 'manual'
      return t(getReferenceSourceLabelKey(sourceKey))
    }
    if (referencesStore.selectedTag?.label) {
      return referencesStore.selectedTag.label
    }
    const sectionKey =
      referencesStore.librarySections.find(
        (section) => section.key === referencesStore.selectedSectionKey
      )?.key || 'all'
    return t(getReferenceSectionLabelKey(sectionKey))
  }
  const activePath = editorStore.activeTab
  if (!activePath) return ''
  if (isNewTab(activePath)) return t('New Tab')
  if (isPreviewPath(activePath)) {
    const sourcePath = previewSourcePathFromPath(activePath)
    return sourcePath.split('/').pop() || t('Preview')
  }
  return activePath.split('/').pop() || activePath
})

function toggleReferenceLibrary() {
  const nextPanel = workspace.leftSidebarPanel === 'references' ? 'files' : 'references'
  workspace.setLeftSidebarPanel(nextPanel)
  if (!workspace.leftSidebarOpen) {
    workspace.toggleLeftSidebar()
  }
}

function openAiAgent() {
  workspace.setRightSidebarPanel('ai')
  workspace.openRightSidebar()
}

function openOutlineInspector() {
  workspace.setRightSidebarPanel('outline')
  workspace.openRightSidebar()
}

function getSecondaryPane() {
  if (!splitPaneOpen.value) return null
  return editorStore.paneTree.children?.[1] || null
}

async function toggleSplitPane() {
  if (!splitPaneOpen.value) {
    const newPaneId = editorStore.splitPane('vertical')
    if (!newPaneId) return
    const newPane = editorStore.findPane(editorStore.paneTree, newPaneId)
    if (newPane && !(newPane.tabs || []).length) {
      editorStore.openNewTab(newPaneId)
    }
    return
  }

  const secondaryPane = getSecondaryPane()
  if (!secondaryPane) return

  const result = await confirmUnsavedChanges(secondaryPane.tabs || [])
  if (result.choice === 'cancel') return

  for (const tab of secondaryPane.tabs || []) {
    workflowStore.handlePreviewClosed(tab)
  }

  editorStore.collapsePane(secondaryPane.id)
}

const {
  leftSidebarWidth,
  rightSidebarWidth,
  isLeftSidebarResizing,
  isRightSidebarResizing,
  onLeftResize,
  startLeftSidebarResize,
  endLeftSidebarResize,
  onRightResize,
  startRightSidebarResize,
  endRightSidebarResize,
  onRightResizeSnap,
  cleanupAppShellLayout,
} = useAppShellLayout()
const { closeWorkspace, handleVisibilityChange, openWorkspace, pickWorkspace, setupWizardVisible } =
  useWorkspaceLifecycle()
function onCursorChange(pos) {
  if (pos?.offset != null) {
    editorStore.cursorOffset = pos.offset
  }
}

function onSelectionChange(selection) {
  aiStore.updateEditorSelection(selection)
}

useAppShellEventBridge({
  workspace,
  editorStore,
  filesStore,
  toggleSplitPane,
  leftSidebarRef,
  handleVisibilityChange,
  pickWorkspace,
  closeWorkspace,
})
useAppTeardown({
  cleanupAppShellLayout,
  workspace,
  filesStore,
  linksStore,
})
useBrowserPreviewRuntime({
  workspace,
  filesStore,
  editorStore,
  referencesStore,
  latexStore,
})
</script>

<style scoped>
.app-shell-root {
  background: var(--app-canvas);
}

.app-shell-root.is-mac-vibrant {
  background: transparent;
  --sidebar-shell-surface: var(--sidebar-vibrant-surface);
  --sidebar-shell-blur: 24px;
  --sidebar-shell-saturate: 0.92;
}

.app-shell-workspace {
  position: relative;
  min-height: 0;
}

.app-shell-root.is-mac-vibrant .app-shell-workspace,
.app-shell-root.is-mac-vibrant .app-shell-workbench {
  background: transparent;
}

.app-shell-root.is-mac-vibrant .app-shell-region-right {
  background: transparent;
}

.app-shell-root.is-mac-vibrant .app-shell-region-left.is-workspace-left-region,
.app-shell-root.is-mac-vibrant :deep(.right-shell-sidebar) {
  backdrop-filter: blur(var(--sidebar-shell-blur)) saturate(var(--sidebar-shell-saturate));
}

.app-shell-root.is-mac-vibrant :deep(.left-shell-sidebar) {
  border-right: none;
}

.app-shell-root.is-mac-vibrant :deep(.right-shell-sidebar) {
  border-left: none;
}

.app-shell-topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  box-shadow: none;
}

.app-shell-workbench {
  min-height: 0;
  gap: 0;
  padding: 0;
  background: var(--app-canvas);
}

.app-shell-region {
  min-height: 0;
  min-width: 0;
}

.app-shell-region-left {
  background: transparent;
  will-change: width;
  transition: width 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

.app-shell-region-left.is-workspace-left-region {
  background: transparent;
}

.app-shell-region-main {
  background: transparent;
  overflow: visible;
}

.app-shell-region-right {
  background: transparent;
  will-change: width;
  transition: width 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

:global(body.altals-shell-resizing) .app-shell-region-left,
:global(body.altals-shell-resizing) .app-shell-region-right,
:global(body.altals-shell-resizing) .app-shell-sidebar,
:global(body.altals-shell-resizing) .app-shell-sidebar-left,
:global(body.altals-shell-resizing) .app-shell-sidebar-right {
  transition: none !important;
}

.app-shell-sidebar {
  contain: layout paint;
  min-width: 100%;
  height: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  will-change: opacity, transform;
  opacity: 1;
  transform: translateX(0);
  transition:
    opacity 200ms ease,
    transform 260ms cubic-bezier(0.16, 1, 0.3, 1),
    background-color 160ms ease;
}

.app-shell-sidebar-left.is-collapsed {
  opacity: 1;
  transform: translateX(-6px);
}

.app-shell-sidebar-right.is-collapsed {
  opacity: 0;
  transform: translateX(10px);
}

.app-shell-sidebar-left {
  transition:
    transform 260ms cubic-bezier(0.16, 1, 0.3, 1),
    background-color 160ms ease;
}

.app-shell-sidebar-left.is-open,
.app-shell-sidebar-right.is-open {
  transition-delay: 24ms;
}

.app-shell-sidebar.is-collapsed {
  pointer-events: none;
}

.app-shell-sidebar.is-resizing {
  pointer-events: none;
  user-select: none;
  transition: none;
}

.app-shell-sidebar.is-resizing :deep(*) {
  transition: none !important;
}

.app-shell-main {
  min-width: 0;
}

.app-shell-main-shell {
  min-width: 220px;
}

.app-shell-main-card {
  min-width: 0;
  box-sizing: border-box;
  padding-top: 30px;
  border: none;
  border-radius: 0;
  background: var(--shell-editor-surface);
  box-shadow: none;
  overflow: hidden;
  z-index: 2;
  transition:
    margin-left 260ms cubic-bezier(0.16, 1, 0.3, 1),
    padding-left 260ms cubic-bezier(0.16, 1, 0.3, 1),
    margin-right 260ms cubic-bezier(0.16, 1, 0.3, 1),
    padding-right 260ms cubic-bezier(0.16, 1, 0.3, 1),
    border-radius 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

.app-shell-main-card.is-empty-workspace-shell {
  padding-top: 0;
}

.app-shell-main-card.has-left-sidebar {
  margin-left: -6px;
  padding-left: 6px;
  border-top-left-radius: 10px;
  border-bottom-left-radius: 10px;
}

.app-shell-main-card.has-right-sidebar {
  margin-right: -10px;
  padding-right: 10px;
  border-top-right-radius: 10px;
  border-bottom-right-radius: 10px;
}

.app-shell-resize-slot {
  flex: 0 0 auto;
  position: relative;
  z-index: 5;
  width: 0;
  overflow: visible;
  opacity: 0;
  transition:
    width 260ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 140ms ease;
}

.app-shell-resize-slot.is-visible {
  width: 0;
  opacity: 1;
  background: transparent;
}

.app-shell-resize-slot.is-hidden {
  pointer-events: none;
}

.app-shell-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  height: 100%;
  margin: 0;
}

.app-shell-resize-handle-left {
  left: -10px;
}

.app-shell-resize-handle-right {
  right: -14px;
}
</style>
