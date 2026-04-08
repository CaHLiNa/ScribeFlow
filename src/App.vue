<template>
  <div
    class="app-shell-root flex flex-col h-screen w-screen overflow-hidden"
    :class="{
      'is-left-resizing': isLeftSidebarResizing,
      'is-right-resizing': isRightSidebarResizing,
      'is-shell-resizing': isLeftSidebarResizing || isRightSidebarResizing,
    }"
  >
    <Header v-if="!workspace.isOpen" />

    <!-- Launcher (no workspace open) -->
    <Launcher
      v-if="!workspace.isOpen"
      @open-folder="pickWorkspace"
      @open-workspace="openWorkspace"
    />

    <!-- Main content area (workspace open) -->
    <template v-if="workspace.isOpen">
      <WorkspaceQuickOpen ref="searchRef" />

      <div class="app-shell-workspace flex flex-1 flex-col overflow-hidden">
        <WorkbenchRail
          class="app-shell-topbar shrink-0"
          tabs-target-id="app-shell-topbar-tabs"
          :left-sidebar-open="workspace.leftSidebarOpen"
          :right-sidebar-open="workspace.rightSidebarOpen"
          :split-pane-open="splitPaneOpen"
          :inspector-available="supportsRightSidebar"
          @collapse-left-folders="leftSidebarRef?.collapseAllFolders?.()"
          @open-left-create-menu="leftSidebarRef?.openCreateMenuFrom?.($event?.currentTarget || null)"
          @toggle-left-sidebar="workspace.toggleLeftSidebar()"
          @toggle-split-pane="toggleSplitPane"
          @toggle-right-sidebar="workspace.toggleRightSidebar()"
        />

        <div class="app-shell-workbench flex flex-1 overflow-hidden">
          <div
            class="app-shell-region app-shell-region-left shrink-0"
            :class="{
              'is-open': workspace.leftSidebarOpen,
              'is-collapsed': !workspace.leftSidebarOpen,
              'is-resizing': isLeftSidebarResizing,
            }"
            :style="{
              width: workspace.leftSidebarOpen ? `${leftSidebarWidth}px` : '0px',
            }"
          >
            <div
              class="app-shell-sidebar app-shell-sidebar-left shrink-0 overflow-hidden"
              :class="{
                'is-open': workspace.leftSidebarOpen,
                'is-collapsed': !workspace.leftSidebarOpen,
                'is-resizing': isLeftSidebarResizing,
              }"
              data-sidebar="left"
              :aria-hidden="workspace.leftSidebarOpen ? 'false' : 'true'"
              :style="{
                width: '100%',
              }"
            >
              <LeftSidebar
                ref="leftSidebarRef"
                @file-version-history="openFileVersionHistory"
                @open-search="openQuickSearch"
                @open-settings="workspace.openSettings()"
                @open-folder="pickWorkspace"
                @open-workspace="openWorkspace"
                @close-folder="closeWorkspace"
              />
            </div>
          </div>

          <!-- Left resize handle -->
          <div
            class="app-shell-resize-slot"
            :class="{ 'is-visible': workspace.leftSidebarOpen, 'is-hidden': !workspace.leftSidebarOpen }"
          >
            <ResizeHandle
              class="app-shell-resize-handle"
              direction="vertical"
              @resize="onLeftResize"
              @resize-start="startLeftSidebarResize"
              @resize-end="endLeftSidebarResize"
            />
          </div>

          <div
            class="app-shell-region app-shell-region-main app-shell-main app-shell-main-shell flex-1 flex flex-col overflow-hidden"
          >
            <div class="app-shell-main-card flex-1 overflow-hidden relative">
              <KeepAlive :max="3">
                <component
                  :is="activeWorkbenchComponent"
                  :key="activeWorkbenchCacheKey"
                  v-bind="activeWorkbenchProps"
                  :class="activeWorkbenchClass"
                  @cursor-change="onCursorChange"
                />
              </KeepAlive>
            </div>
          </div>

          <template v-if="supportsRightSidebar">
            <div
              class="app-shell-resize-slot"
              :class="{ 'is-visible': workspace.rightSidebarOpen, 'is-hidden': !workspace.rightSidebarOpen }"
            >
              <ResizeHandle
                class="app-shell-resize-handle"
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
    </template>

    <WorkspaceSnapshotBrowser
      :visible="workspaceSnapshotBrowserVisible"
      :creating-snapshot="creatingWorkspaceSnapshot"
      :create-feedback="workspaceSnapshotBrowserFeedback"
      :refresh-token="workspaceSnapshotBrowserRefreshToken"
      @close="workspaceSnapshotBrowserVisible = false"
      @create-snapshot="handleCreateWorkspaceSnapshot"
    />

    <!-- File Version History Modal -->
    <FileVersionHistory
      :visible="fileVersionHistoryVisible"
      :filePath="fileVersionHistoryFile"
      @close="fileVersionHistoryVisible = false"
    />

    <!-- Settings Modal -->
    <Settings
      :visible="workspace.settingsOpen"
      :initialSection="workspace.settingsSection"
      @close="workspace.closeSettings()"
    />

    <UnsavedChangesDialog />

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
import { useToastStore } from './stores/toast'

import Header from './components/layout/Header.vue'
import ResizeHandle from './components/layout/ResizeHandle.vue'
import WorkbenchRail from './components/layout/WorkbenchRail.vue'
import WorkspaceQuickOpen from './components/layout/WorkspaceQuickOpen.vue'
import Launcher from './components/Launcher.vue'
import ToastContainer from './components/layout/ToastContainer.vue'
import { useI18n } from './i18n'
import { useAppShellLayout } from './composables/useAppShellLayout'
import { useWorkspaceSnapshotActions } from './app/changes/useWorkspaceSnapshotActions'
import { useAppShellEventBridge } from './app/shell/useAppShellEventBridge'
import { useAppTeardown } from './app/teardown/useAppTeardown'
import { useWorkspaceLifecycle } from './app/workspace/useWorkspaceLifecycle'
import { confirmUnsavedChanges } from './services/unsavedChanges'

const LeftSidebar = defineAsyncComponent(() => import('./components/sidebar/LeftSidebar.vue'))
const RightSidebar = defineAsyncComponent(() => import('./components/sidebar/RightSidebar.vue'))
const PaneContainer = defineAsyncComponent(() => import('./components/editor/PaneContainer.vue'))
const WorkspaceSnapshotBrowser = defineAsyncComponent(
  () => import('./components/WorkspaceSnapshotBrowser.vue')
)
const FileVersionHistory = defineAsyncComponent(() => import('./components/VersionHistory.vue'))
const Settings = defineAsyncComponent(() => import('./components/settings/Settings.vue'))
const SetupWizard = defineAsyncComponent(() => import('./components/SetupWizard.vue'))
const UnsavedChangesDialog = defineAsyncComponent(
  () => import('./components/UnsavedChangesDialog.vue')
)

const workspace = useWorkspaceStore()
const filesStore = useFilesStore()
const editorStore = useEditorStore()
const workflowStore = useDocumentWorkflowStore()
const linksStore = useLinksStore()
const toastStore = useToastStore()
const { t } = useI18n()

const searchRef = ref(null)
const leftSidebarRef = ref(null)
const creatingWorkspaceSnapshot = ref(false)
const workspaceSnapshotBrowserRefreshToken = ref(0)
const workspaceSnapshotBrowserVisible = ref(false)
const workspaceSnapshotBrowserFeedback = ref(null)
const fileVersionHistoryVisible = ref(false)
const fileVersionHistoryFile = ref('')

const supportsRightSidebar = computed(() => workspace.isOpen)
const splitPaneOpen = computed(() => (
  editorStore.paneTree?.type === 'split'
  && Array.isArray(editorStore.paneTree.children)
  && editorStore.paneTree.children.length === 2
))
const activeWorkbenchComponent = computed(() => PaneContainer)
const activeWorkbenchCacheKey = computed(() => workspace.primarySurface || 'workspace')
const activeWorkbenchProps = computed(() => ({
  node: editorStore.paneTree,
  topbarTabsTargetSelector: '#app-shell-topbar-tabs',
}))
const activeWorkbenchClass = computed(() => 'h-full min-h-0 w-full')

function openQuickSearch() {
  searchRef.value?.focusSearch?.()
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

  const result = await confirmUnsavedChanges(secondaryPane.tabs || [], {
    message: t('These files have unsaved changes and will be closed with this pane.'),
  })
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
const { createSnapshot, openWorkspaceSnapshots, openFileVersionHistory } =
  useWorkspaceSnapshotActions({
    workspace,
    filesStore,
    editorStore,
    toastStore,
    workspaceSnapshotBrowserVisible,
    fileVersionHistoryVisible,
    fileVersionHistoryFile,
    t,
  })

async function handleCreateWorkspaceSnapshot() {
  if (creatingWorkspaceSnapshot.value) {
    return
  }

  creatingWorkspaceSnapshot.value = true
  try {
    const result = await createSnapshot({
      requestSnapshotLabel: null,
      allowLocalSavePointWhenUnchanged: true,
      showNoChanges: () => {},
      showCommitFailure: () => {},
    })
    if (result?.snapshot) {
      workspaceSnapshotBrowserRefreshToken.value += 1
    }
    workspaceSnapshotBrowserFeedback.value = buildWorkspaceSnapshotBrowserFeedback(result)
  } finally {
    creatingWorkspaceSnapshot.value = false
  }
}

function buildWorkspaceSnapshotBrowserFeedback(result) {
  const id = Date.now()
  if (result?.reason === 'created-local-save-point') {
    return {
      id,
      title: t('Save point added'),
      message: t('Added a local workspace save point without new file changes.'),
    }
  }

  if (result?.snapshot) {
    return {
      id,
      title: t('Save point added'),
      message: t('Added a new workspace save point to Saved Versions.'),
    }
  }

  if (result?.reason === 'no-changes') {
    return {
      id,
      title: t('Nothing new to save'),
      message: t('There were no file changes to capture for a new workspace save point.'),
    }
  }

  return {
    id,
    title: t('Could not add save point'),
    message: t('Altals could not create a new workspace save point this time.'),
  }
}
function onCursorChange(pos) {
  if (pos?.offset != null) {
    editorStore.cursorOffset = pos.offset
  }
}

useAppShellEventBridge({
  workspace,
  editorStore,
  toggleSplitPane,
  searchRef,
  leftSidebarRef,
  workspaceSnapshotBrowserVisible,
  fileVersionHistoryVisible,
  handleVisibilityChange,
  pickWorkspace,
  closeWorkspace,
  createSnapshot,
  openWorkspaceSnapshots,
  openFileVersionHistory,
})
useAppTeardown({
  cleanupAppShellLayout,
  workspace,
  filesStore,
  linksStore,
})
</script>

<style scoped>
.app-shell-root {
  background: var(--app-canvas);
}

.app-shell-workspace {
  position: relative;
  min-height: 0;
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

.app-shell-region-main {
  background: var(--shell-editor-surface);
}

.app-shell-region-right {
  background: transparent;
  will-change: width;
  transition: width 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

.app-shell-sidebar {
  contain: layout paint;
  height: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  will-change: opacity, transform;
  transition:
    opacity 200ms ease,
    transform 260ms cubic-bezier(0.16, 1, 0.3, 1),
    background-color 160ms ease;
}

.app-shell-sidebar > * {
  min-width: 100%;
  height: 100%;
  transform: translateX(0);
  transition:
    opacity 180ms ease,
    transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

.app-shell-sidebar-left.is-collapsed > * {
  opacity: 0;
  transform: translateX(-10px);
}

.app-shell-sidebar-right.is-collapsed > * {
  opacity: 0;
  transform: translateX(10px);
}

.app-shell-sidebar-left.is-open > *,
.app-shell-sidebar-right.is-open > * {
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
}

.app-shell-resize-slot {
  flex: 0 0 auto;
  width: 0;
  overflow: hidden;
  opacity: 0;
  transition:
    width 260ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 140ms ease;
}

.app-shell-resize-slot.is-visible {
  width: 6px;
  opacity: 1;
  background: transparent;
}

.app-shell-resize-slot.is-hidden {
  pointer-events: none;
}

.app-shell-resize-handle {
  width: 6px;
  height: 100%;
}
</style>
