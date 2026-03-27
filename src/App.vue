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
      :left-rail-width="WORKBENCH_RAIL_WIDTH"
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
        <div class="app-shell-main flex-1 flex flex-col overflow-hidden" style="min-width: 200px">
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
import { ref, computed, defineAsyncComponent, onUnmounted, watch } from 'vue'
import { useWorkspaceStore } from './stores/workspace'
import { useFilesStore } from './stores/files'
import { useEditorStore } from './stores/editor'
import { useReviewsStore } from './stores/reviews'
import { useCommentsStore } from './stores/comments'
import { useLinksStore } from './stores/links'
import { useAiWorkbenchStore } from './stores/aiWorkbench'
import { useAiWorkflowRunsStore } from './stores/aiWorkflowRuns'
import { useReferencesStore } from './stores/references'
import { useResearchArtifactsStore } from './stores/researchArtifacts'
import { useToastStore } from './stores/toast'

import Header from './components/layout/Header.vue'
import Footer from './components/layout/Footer.vue'
import ResizeHandle from './components/layout/ResizeHandle.vue'
import WorkbenchRail from './components/layout/WorkbenchRail.vue'
import Launcher from './components/Launcher.vue'
import ToastContainer from './components/layout/ToastContainer.vue'
import { useI18n } from './i18n'
import { useAppShellLayout } from './composables/useAppShellLayout'
import { useFooterStatusSync } from './app/editor/useFooterStatusSync'
import { useWorkspaceSnapshotActions } from './app/changes/useWorkspaceSnapshotActions'
import { useAppShellEventBridge } from './app/shell/useAppShellEventBridge'
import { useAppTeardown } from './app/teardown/useAppTeardown'
import { useWorkspaceLifecycle } from './app/workspace/useWorkspaceLifecycle'
import { hasVisiblePdfPane } from './domains/editor/paneTreeViewerRuntime'
import {
  SIDEBAR_TOGGLE_RESIZE_PULSE_MS,
  shouldPulseShellResizeForSidebarToggle,
} from './domains/editor/pdfViewerRuntime'
import { setShellResizeActive } from './shared/shellResizeSignals'

const LeftSidebar = defineAsyncComponent(() => import('./components/sidebar/LeftSidebar.vue'))
const RightSidebar = defineAsyncComponent(() => import('./components/sidebar/RightSidebar.vue'))
const BottomPanel = defineAsyncComponent(() => import('./components/layout/BottomPanel.vue'))
const PaneContainer = defineAsyncComponent(() => import('./components/editor/PaneContainer.vue'))
const DocumentConversionWorkbench = defineAsyncComponent(
  () => import('./components/conversion/DocumentConversionWorkbench.vue')
)
const WorkspaceSnapshotBrowser = defineAsyncComponent(
  () => import('./components/WorkspaceSnapshotBrowser.vue')
)
const FileVersionHistory = defineAsyncComponent(() => import('./components/VersionHistory.vue'))
const Settings = defineAsyncComponent(() => import('./components/settings/Settings.vue'))
const SetupWizard = defineAsyncComponent(() => import('./components/SetupWizard.vue'))
const AiWorkbenchSurface = defineAsyncComponent(
  () => import('./components/ai/AiWorkbenchSurface.vue')
)
const GlobalLibraryWorkbench = defineAsyncComponent(
  () => import('./components/library/GlobalLibraryWorkbench.vue')
)
const UnsavedChangesDialog = defineAsyncComponent(
  () => import('./components/UnsavedChangesDialog.vue')
)

async function resolveChatStore() {
  const { useChatStore } = await import('./stores/chat.js')
  return useChatStore()
}

const workspace = useWorkspaceStore()
const filesStore = useFilesStore()
const editorStore = useEditorStore()
const reviews = useReviewsStore()
const commentsStore = useCommentsStore()
const linksStore = useLinksStore()
const aiWorkbenchStore = useAiWorkbenchStore()
const aiWorkflowRuns = useAiWorkflowRunsStore()
const referencesStore = useReferencesStore()
const researchArtifactsStore = useResearchArtifactsStore()
const toastStore = useToastStore()
const { t } = useI18n()

const footerRef = ref(null)
const headerRef = ref(null)
const leftSidebarRef = ref(null)
const bottomPanelRef = ref(null)
const creatingWorkspaceSnapshot = ref(false)
const workspaceSnapshotBrowserRefreshToken = ref(0)
const workspaceSnapshotBrowserVisible = ref(false)
const workspaceSnapshotBrowserFeedback = ref(null)
const fileVersionHistoryVisible = ref(false)
const fileVersionHistoryFile = ref('')
const WORKBENCH_RAIL_WIDTH = 44

aiWorkflowRuns.configureExecutor({
  resolveChatStore,
  toastStore,
  aiWorkbenchStore,
})

const supportsRightSidebar = computed(
  () => workspace.isOpen && !workspace.isAiSurface && !workspace.isConversionSurface
)
const activeWorkbenchComponent = computed(() => {
  if (workspace.isLibrarySurface) return GlobalLibraryWorkbench
  if (workspace.isAiSurface) return AiWorkbenchSurface
  if (workspace.isConversionSurface) return DocumentConversionWorkbench
  return PaneContainer
})
const activeWorkbenchCacheKey = computed(() => workspace.primarySurface || 'workspace')
const activeWorkbenchProps = computed(() =>
  workspace.isWorkspaceSurface ? { node: editorStore.paneTree } : {}
)
const activeWorkbenchClass = computed(() =>
  workspace.isWorkspaceSurface ? 'h-full min-h-0 w-full' : 'h-full min-h-0 w-full'
)
let sidebarToggleResizePulseTimer = null

function clearSidebarToggleResizePulse() {
  if (sidebarToggleResizePulseTimer !== null) {
    window.clearTimeout(sidebarToggleResizePulseTimer)
    sidebarToggleResizePulseTimer = null
  }
  setShellResizeActive(false, { source: 'sidebar-toggle' })
}

function pulseShellResizeForSidebarToggle(side) {
  if (typeof window === 'undefined') return
  setShellResizeActive(true, { source: 'sidebar-toggle', side })
  if (sidebarToggleResizePulseTimer !== null) {
    window.clearTimeout(sidebarToggleResizePulseTimer)
  }
  sidebarToggleResizePulseTimer = window.setTimeout(() => {
    sidebarToggleResizePulseTimer = null
    setShellResizeActive(false, { source: 'sidebar-toggle', side })
  }, SIDEBAR_TOGGLE_RESIZE_PULSE_MS)
}
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
const { closeWorkspace, handleVisibilityChange, openWorkspace, pickWorkspace, setupWizardVisible } =
  useWorkspaceLifecycle()
const { createSnapshot, openWorkspaceSnapshots, openFileVersionHistory } =
  useWorkspaceSnapshotActions({
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
const { onCursorChange, onEditorStats } = useFooterStatusSync({
  footerRef,
  editorStore,
})

useAppShellEventBridge({
  workspace,
  editorStore,
  commentsStore,
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
  commentsStore,
  referencesStore,
  researchArtifactsStore,
})

watch(
  () => workspace.leftSidebarOpen,
  (nextOpen, previousOpen) => {
    if (
      !shouldPulseShellResizeForSidebarToggle({
        previousOpen,
        nextOpen,
        hasVisiblePdfPane: hasVisiblePdfPane(editorStore.paneTree),
      })
    ) {
      return
    }
    pulseShellResizeForSidebarToggle('left')
  },
  { flush: 'sync' }
)

watch(
  () => workspace.rightSidebarOpen,
  (nextOpen, previousOpen) => {
    if (
      !shouldPulseShellResizeForSidebarToggle({
        previousOpen,
        nextOpen,
        hasVisiblePdfPane: hasVisiblePdfPane(editorStore.paneTree),
      })
    ) {
      return
    }
    pulseShellResizeForSidebarToggle('right')
  },
  { flush: 'sync' }
)

onUnmounted(() => {
  clearSidebarToggleResizePulse()
})
</script>

<style scoped>
.app-shell-sidebar {
  contain: layout paint;
  transition: border-color 140ms ease;
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
</style>
