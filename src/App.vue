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
          workflow-target-id="app-shell-topbar-workflow"
          :left-sidebar-open="workspace.leftSidebarOpen"
          :right-sidebar-open="workspace.rightSidebarOpen"
          :inspector-available="supportsRightSidebar"
          @open-settings="workspace.openSettings()"
          @open-search="openQuickSearch"
          @toggle-left-sidebar="workspace.toggleLeftSidebar()"
          @toggle-right-sidebar="workspace.toggleRightSidebar()"
        />

        <div class="app-shell-workbench flex flex-1 overflow-hidden">
          <div class="app-shell-region app-shell-region-left shrink-0">
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
                width: workspace.leftSidebarOpen ? `${leftSidebarWidth}px` : '0px',
              }"
            >
              <LeftSidebar
                ref="leftSidebarRef"
                @file-version-history="openFileVersionHistory"
                @open-folder="pickWorkspace"
                @open-workspace="openWorkspace"
                @close-folder="closeWorkspace"
              />
            </div>
          </div>

          <!-- Left resize handle -->
          <ResizeHandle
            v-if="workspace.leftSidebarOpen"
            direction="vertical"
            @resize="onLeftResize"
            @resize-start="startLeftSidebarResize"
            @resize-end="endLeftSidebarResize"
          />

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
                  topbarTabsTargetSelector="#app-shell-topbar-tabs"
                  topbarWorkflowTargetSelector="#app-shell-topbar-workflow"
                  @cursor-change="onCursorChange"
                />
              </KeepAlive>
            </div>
          </div>

          <template v-if="supportsRightSidebar">
            <ResizeHandle
              v-if="workspace.rightSidebarOpen"
              direction="vertical"
              @resize="onRightResize"
              @resize-start="startRightSidebarResize"
              @resize-end="endRightSidebarResize"
              @dblclick="onRightResizeSnap"
            />

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
import { useCommentsStore } from './stores/comments'
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
const commentsStore = useCommentsStore()
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
const activeWorkbenchComponent = computed(() => PaneContainer)
const activeWorkbenchCacheKey = computed(() => workspace.primarySurface || 'workspace')
const activeWorkbenchProps = computed(() => ({ node: editorStore.paneTree }))
const activeWorkbenchClass = computed(() => 'h-full min-h-0 w-full')

function openQuickSearch() {
  searchRef.value?.focusSearch?.()
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
  commentsStore,
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
  commentsStore,
})
</script>

<style scoped>
.app-shell-root {
  background: transparent;
}

.app-shell-workspace {
  min-height: 0;
}

.app-shell-topbar {
  flex: 0 0 auto;
}

.app-shell-workbench {
  min-height: 0;
  gap: 0;
  padding: 0;
}

.app-shell-region {
  min-height: 0;
  min-width: 0;
}

.app-shell-region-left {
  background: color-mix(in srgb, var(--panel-surface) 62%, transparent);
}

.app-shell-region-main {
  background: transparent;
}

.app-shell-region-right {
  background: color-mix(in srgb, var(--panel-surface) 48%, transparent);
}

.app-shell-sidebar {
  contain: layout paint;
  height: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  transition:
    opacity 140ms ease,
    background-color 140ms ease;
}

.app-shell-sidebar > * {
  min-width: 100%;
  height: 100%;
}

.app-shell-sidebar-left.is-collapsed > * {
  opacity: 0;
}

.app-shell-sidebar-right.is-collapsed > * {
  opacity: 0;
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
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: hidden;
}
</style>
