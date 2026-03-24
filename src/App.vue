<template>
  <div
    class="app-shell-root flex flex-col h-screen w-screen overflow-hidden"
    :class="{
      'is-left-resizing': isLeftSidebarResizing,
      'is-right-resizing': isRightSidebarResizing,
      'is-shell-resizing': isLeftSidebarResizing || isRightSidebarResizing,
    }"
  >
    <!-- Header (always visible) -->
    <Header
      ref="headerRef"
      :left-sidebar-width="leftSidebarWidth"
      :left-rail-width="WORKBENCH_RAIL_WIDTH"
      :right-sidebar-width="rightSidebarWidth"
      :left-sidebar-resizing="isLeftSidebarResizing"
      :right-sidebar-resizing="isRightSidebarResizing"
    />

    <!-- Launcher (no workspace open) -->
    <Launcher
      v-if="!workspace.isOpen"
      @open-folder="pickWorkspace"
      @open-workspace="openWorkspace"
    />

    <!-- Main content area (workspace open) -->
    <template v-if="workspace.isOpen">
      <div class="app-shell-workbench flex flex-1 overflow-hidden">
        <WorkbenchRail class="shrink-0" @open-settings="workspace.openSettings()" />

        <!-- Left sidebar: active project panel -->
        <div
          class="app-shell-sidebar app-shell-sidebar-left shrink-0 overflow-hidden border-r"
          :class="{
            'is-open': workspace.leftSidebarOpen,
            'is-collapsed': !workspace.leftSidebarOpen,
            'is-resizing': isLeftSidebarResizing,
          }"
          data-sidebar="left"
          :aria-hidden="workspace.leftSidebarOpen ? 'false' : 'true'"
          :style="{
            width: workspace.leftSidebarOpen ? `${leftSidebarWidth}px` : '0px',
            borderColor: workspace.leftSidebarOpen ? 'var(--border)' : 'transparent',
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

        <!-- Left resize handle -->
        <ResizeHandle
          v-if="workspace.leftSidebarOpen"
          direction="vertical"
          @resize="onLeftResize"
          @resize-start="startLeftSidebarResize"
          @resize-end="endLeftSidebarResize"
        />

        <!-- Center: Editor panes + bottom panel -->
        <div class="app-shell-main flex-1 flex flex-col overflow-hidden" style="min-width: 200px;">
          <div class="flex-1 overflow-hidden relative">
            <KeepAlive :max="3">
              <component
                :is="activeWorkbenchComponent"
                :key="activeWorkbenchCacheKey"
                v-bind="activeWorkbenchProps"
                :class="activeWorkbenchClass"
                @cursor-change="onCursorChange"
                @editor-stats="onEditorStats"
              />
            </KeepAlive>
          </div>

          <template v-if="workspace.isWorkspaceSurface">
            <!-- Bottom panel resize handle -->
            <ResizeHandle
              v-if="workspace.bottomPanelOpen"
              direction="horizontal"
              @resize="onBottomResize"
            />

            <!-- Bottom panel: Terminals -->
            <BottomPanel ref="bottomPanelRef" :panel-height="bottomPanelHeight" />
          </template>
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
            class="app-shell-sidebar app-shell-sidebar-right shrink-0 overflow-hidden border-l"
            :class="{
              'is-open': workspace.rightSidebarOpen,
              'is-collapsed': !workspace.rightSidebarOpen,
              'is-resizing': isRightSidebarResizing,
            }"
            data-sidebar="right"
            :aria-hidden="workspace.rightSidebarOpen ? 'false' : 'true'"
            :style="{
              width: workspace.rightSidebarOpen ? `${rightSidebarWidth}px` : '0px',
              borderColor: workspace.rightSidebarOpen ? 'var(--border)' : 'transparent',
            }"
          >
            <RightSidebar />
          </div>
        </template>

      </div>

      <!-- Footer -->
      <Footer
        ref="footerRef"
        @open-settings="(s) => workspace.openSettings(s)"
        @open-workspace-snapshots="openWorkspaceSnapshots"
      />
    </template>

    <WorkspaceSnapshotBrowser
      :visible="workspaceSnapshotBrowserVisible"
      @close="workspaceSnapshotBrowserVisible = false"
    />

    <!-- File Version History Modal -->
    <FileVersionHistory
      :visible="fileVersionHistoryVisible"
      :filePath="fileVersionHistoryFile"
      @close="fileVersionHistoryVisible = false"
    />

    <!-- Settings Modal -->
    <Settings :visible="workspace.settingsOpen" :initialSection="workspace.settingsSection" @close="workspace.closeSettings()" />

    <UnsavedChangesDialog />

    <!-- Setup Wizard (first-time) -->
    <SetupWizard :visible="setupWizardVisible" @close="setupWizardVisible = false" />

    <!-- Toasts -->
    <ToastContainer />
  </div>
</template>

<script setup>
import { ref, computed, defineAsyncComponent, KeepAlive } from 'vue'
import { useWorkspaceStore } from './stores/workspace'
import { useFilesStore } from './stores/files'
import { useEditorStore } from './stores/editor'
import { useReviewsStore } from './stores/reviews'
import { useCommentsStore } from './stores/comments'
import { useLinksStore } from './stores/links'
import { useChatStore } from './stores/chat'
import { useReferencesStore } from './stores/references'
import { useResearchArtifactsStore } from './stores/researchArtifacts'
import { useToastStore } from './stores/toast'

import Header from './components/layout/Header.vue'
import Footer from './components/layout/Footer.vue'
import ResizeHandle from './components/layout/ResizeHandle.vue'
import WorkbenchRail from './components/layout/WorkbenchRail.vue'
import PaneContainer from './components/editor/PaneContainer.vue'
import Launcher from './components/Launcher.vue'
import ToastContainer from './components/layout/ToastContainer.vue'
import { useI18n } from './i18n'
import { useAppShellLayout } from './composables/useAppShellLayout'
import { useFooterStatusSync } from './app/editor/useFooterStatusSync'
import { useWorkspaceSnapshotActions } from './app/changes/useWorkspaceSnapshotActions'
import { useAppShellEventBridge } from './app/shell/useAppShellEventBridge'
import { useAppTeardown } from './app/teardown/useAppTeardown'
import { useWorkspaceLifecycle } from './app/workspace/useWorkspaceLifecycle'

const LeftSidebar = defineAsyncComponent(() => import('./components/sidebar/LeftSidebar.vue'))
const RightSidebar = defineAsyncComponent(() => import('./components/sidebar/RightSidebar.vue'))
const BottomPanel = defineAsyncComponent(() => import('./components/layout/BottomPanel.vue'))
const WorkspaceSnapshotBrowser = defineAsyncComponent(() => import('./components/WorkspaceSnapshotBrowser.vue'))
const FileVersionHistory = defineAsyncComponent(() => import('./components/VersionHistory.vue'))
const Settings = defineAsyncComponent(() => import('./components/settings/Settings.vue'))
const SetupWizard = defineAsyncComponent(() => import('./components/SetupWizard.vue'))
const AiWorkbenchSurface = defineAsyncComponent(() => import('./components/ai/AiWorkbenchSurface.vue'))
const GlobalLibraryWorkbench = defineAsyncComponent(() => import('./components/library/GlobalLibraryWorkbench.vue'))
const UnsavedChangesDialog = defineAsyncComponent(() => import('./components/UnsavedChangesDialog.vue'))

const workspace = useWorkspaceStore()
const filesStore = useFilesStore()
const editorStore = useEditorStore()
const reviews = useReviewsStore()
const commentsStore = useCommentsStore()
const linksStore = useLinksStore()
const chatStore = useChatStore()
const referencesStore = useReferencesStore()
const researchArtifactsStore = useResearchArtifactsStore()
const toastStore = useToastStore()
const { t } = useI18n()

const footerRef = ref(null)
const headerRef = ref(null)
const leftSidebarRef = ref(null)
const bottomPanelRef = ref(null)
const workspaceSnapshotBrowserVisible = ref(false)
const fileVersionHistoryVisible = ref(false)
const fileVersionHistoryFile = ref('')
const WORKBENCH_RAIL_WIDTH = 44
const supportsRightSidebar = computed(() => (
  workspace.isOpen
  && !workspace.isAiSurface
))
const activeWorkbenchComponent = computed(() => {
  if (workspace.isLibrarySurface) return GlobalLibraryWorkbench
  if (workspace.isAiSurface) return AiWorkbenchSurface
  return PaneContainer
})
const activeWorkbenchCacheKey = computed(() => workspace.primarySurface || 'workspace')
const activeWorkbenchProps = computed(() => (
  workspace.isWorkspaceSurface
    ? { node: editorStore.paneTree }
    : {}
))
const activeWorkbenchClass = computed(() => (
  workspace.isWorkspaceSurface
    ? 'h-full min-h-0 w-full'
    : 'h-full min-h-0 w-full'
))
const {
  leftSidebarWidth,
  rightSidebarWidth,
  bottomPanelHeight,
  isLeftSidebarResizing,
  isRightSidebarResizing,
  onLeftResize,
  startLeftSidebarResize,
  endLeftSidebarResize,
  onRightResize,
  startRightSidebarResize,
  endRightSidebarResize,
  onRightResizeSnap,
  onBottomResize,
  cleanupAppShellLayout,
} = useAppShellLayout()
const {
  closeWorkspace,
  handleVisibilityChange,
  openWorkspace,
  pickWorkspace,
  setupWizardVisible,
} = useWorkspaceLifecycle()
const {
  createSnapshot,
  openWorkspaceSnapshots,
  openFileVersionHistory,
} = useWorkspaceSnapshotActions({
  workspace,
  filesStore,
  editorStore,
  footerRef,
  toastStore,
  workspaceSnapshotBrowserVisible,
  fileVersionHistoryVisible,
  fileVersionHistoryFile,
  t,
})
const { onCursorChange, onEditorStats } = useFooterStatusSync({
  footerRef,
  editorStore,
})

useAppShellEventBridge({
  workspace,
  editorStore,
  commentsStore,
  chatStore,
  headerRef,
  leftSidebarRef,
  bottomPanelRef,
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
  reviews,
  linksStore,
  chatStore,
  commentsStore,
  referencesStore,
  researchArtifactsStore,
})
</script>

<style scoped>
.app-shell-sidebar {
  contain: layout paint;
  will-change: width;
  transform: translateZ(0);
  backface-visibility: hidden;
  transition:
    width 180ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 140ms ease;
}

.app-shell-sidebar > * {
  min-width: 100%;
  height: 100%;
  opacity: 1;
  transition:
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 120ms ease;
}

.app-shell-sidebar-left.is-collapsed > * {
  opacity: 0;
  transform: translateX(-10px);
}

.app-shell-sidebar-right.is-collapsed > * {
  opacity: 0;
  transform: translateX(10px);
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
</style>
