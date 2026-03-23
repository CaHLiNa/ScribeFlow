<template>
  <div class="flex flex-col h-screen w-screen overflow-hidden">
    <!-- Header (always visible) -->
    <Header
      ref="headerRef"
      :left-sidebar-width="leftSidebarWidth"
      :left-rail-width="WORKBENCH_RAIL_WIDTH"
    />

    <!-- Launcher (no workspace open) -->
    <Launcher
      v-if="!workspace.isOpen"
      @open-folder="pickWorkspace"
      @open-workspace="openWorkspace"
    />

    <!-- Main content area (workspace open) -->
    <template v-if="workspace.isOpen">
      <div class="flex flex-1 overflow-hidden">
        <WorkbenchRail class="shrink-0" @open-settings="workspace.openSettings()" />

        <!-- Left sidebar: active project panel -->
        <div
          v-if="workspace.leftSidebarOpen"
          data-sidebar="left"
          class="shrink-0 overflow-hidden border-r"
          :style="{ width: leftSidebarWidth + 'px', borderColor: 'var(--border)' }"
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
        />

        <!-- Center: Editor panes + bottom panel -->
        <div class="flex-1 flex flex-col overflow-hidden" style="min-width: 200px;">
          <div class="flex-1 overflow-hidden relative">
            <template v-if="workspace.isWorkspaceSurface">
              <PaneContainer
                :node="editorStore.paneTree"
                @cursor-change="onCursorChange"
                @editor-stats="onEditorStats"
              />
            </template>

            <GlobalLibraryWorkbench
              v-else-if="workspace.isLibrarySurface"
              class="h-full min-h-0 w-full"
            />

            <AiWorkbenchSurface
              v-else-if="workspace.isAiSurface"
              class="h-full min-h-0 w-full"
            />

            <Transition name="ai-sidebar-drawer" appear>
              <div
                v-if="workspace.rightSidebarOpen && !workspace.isAiSurface"
                class="ai-sidebar-shell absolute inset-y-0 right-0 z-20 flex items-stretch px-2 py-2 pointer-events-none"
              >
                <div class="ai-sidebar-frame pointer-events-auto flex items-stretch h-full">
                  <ResizeHandle
                    direction="vertical"
                    @resize="onRightResize"
                    @dblclick="onRightResizeSnap"
                  />
                  <div
                    class="h-full overflow-hidden"
                    :style="{ width: rightSidebarWidth + 'px' }"
                  >
                    <AiDrawer />
                  </div>
                </div>
              </div>
            </Transition>
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
import { ref, defineAsyncComponent } from 'vue'
import { useWorkspaceStore } from './stores/workspace'
import { useFilesStore } from './stores/files'
import { useEditorStore } from './stores/editor'
import { useReviewsStore } from './stores/reviews'
import { useCommentsStore } from './stores/comments'
import { useLinksStore } from './stores/links'
import { useChatStore } from './stores/chat'
import { useReferencesStore } from './stores/references'
import { useResearchArtifactsStore } from './stores/researchArtifacts'
import { useAiDrawerStore } from './stores/aiDrawer'
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
const BottomPanel = defineAsyncComponent(() => import('./components/layout/BottomPanel.vue'))
const WorkspaceSnapshotBrowser = defineAsyncComponent(() => import('./components/WorkspaceSnapshotBrowser.vue'))
const FileVersionHistory = defineAsyncComponent(() => import('./components/VersionHistory.vue'))
const Settings = defineAsyncComponent(() => import('./components/settings/Settings.vue'))
const SetupWizard = defineAsyncComponent(() => import('./components/SetupWizard.vue'))
const AiDrawer = defineAsyncComponent(() => import('./components/ai/AiDrawer.vue'))
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
const aiDrawerStore = useAiDrawerStore()
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
const {
  leftSidebarWidth,
  rightSidebarWidth,
  bottomPanelHeight,
  onLeftResize,
  onRightResize,
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
  aiDrawerStore,
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
.ai-sidebar-shell {
  will-change: transform, opacity, filter;
  transform-origin: right center;
}

.ai-sidebar-frame {
  height: 100%;
  overflow: hidden;
  border-radius: 14px 0 0 14px;
}

.ai-sidebar-drawer-enter-active,
.ai-sidebar-drawer-leave-active {
  transition:
    transform 190ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 170ms ease,
    filter 190ms ease;
}

.ai-sidebar-drawer-enter-from,
.ai-sidebar-drawer-leave-to {
  opacity: 0;
  transform: translateX(18px);
  filter: blur(1.5px);
}

.ai-sidebar-drawer-enter-to,
.ai-sidebar-drawer-leave-from {
  opacity: 1;
  transform: translateX(0);
  filter: blur(0);
}
</style>
