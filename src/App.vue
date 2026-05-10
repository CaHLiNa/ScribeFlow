--- START OF FILE src/App.vue ---

<template>
  <div
    class="app-shell-root flex flex-col h-screen w-screen overflow-hidden"
    :class="{
      'is-left-resizing': isLeftSidebarResizing,
      'is-right-resizing': isRightSidebarResizing,
      'is-shell-resizing': isLeftSidebarResizing || isRightSidebarResizing,
      'is-zen-mode': isZenMode
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
        :right-sidebar-available="supportsRightSidebar"
        :right-sidebar-open="rightRailOpen"
        @select-workbench-panel="selectWorkbenchPanel"
        @toggle-left-sidebar="workspace.toggleLeftSidebar()"
        @toggle-right-sidebar="toggleRightDock"
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
            '--app-shell-sidebar-width': `${leftSidebarWidth}px`,
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
              width: 'var(--app-shell-sidebar-width)',
            }"
          >
            <KeepAlive :max="2">
              <LeftSidebar
                v-if="workspace.isWorkspaceSurface && workspace.isOpen"
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
              'has-right-sidebar': rightRailOpen,
              'is-workspace-surface-shell': workspace.isWorkspaceSurface,
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
                @inline-dock-close="closeDocumentDock"
                @inline-dock-resize="onInlineDockResize"
                @inline-dock-resize-end="endRightSidebarResize"
                @inline-dock-resize-snap="onInlineDockResizeSnap"
                @inline-dock-resize-start="startRightSidebarResize"
                @selection-change="onSelectionChange"
              />
            </KeepAlive>
          </div>
        </div>
      </div>
    </div>

    <!-- Setup Wizard (first-time) -->
    <SetupWizard :visible="setupWizardVisible" @close="setupWizardVisible = false" />

    <ExtensionCommandPalette
      :visible="commandPaletteVisible"
      :target="commandPaletteTarget"
      :context="extensionCommandContext"
      @close="commandPaletteVisible = false"
    />

    <ExtensionWindowPrompt
      :visible="extensionWindowUi.visible"
      :busy="extensionWindowUi.busy"
      :request="extensionWindowUi.pendingRequest"
      @cancel="void handleExtensionWindowPromptCancel()"
      @submit="(value) => void handleExtensionWindowPromptSubmit(value)"
    />

    <!-- Toasts -->
    <ToastContainer />
  </div>
</template>

<script setup>
import { ref, computed, defineAsyncComponent, onMounted, onBeforeUnmount } from 'vue'
import { useWorkspaceStore } from './stores/workspace'
import { useFilesStore } from './stores/files'
import { useEditorStore } from './stores/editor'
import { useDocumentWorkflowStore } from './stores/documentWorkflow'
import { useLinksStore } from './stores/links'
import { useLatexStore } from './stores/latex'
import { useReferencesStore } from './stores/references'
import { useExtensionsStore } from './stores/extensions'
import { useExtensionWindowUiStore } from './stores/extensionWindowUi'
import { useToastStore } from './stores/toast'

import ResizeHandle from './components/layout/ResizeHandle.vue'
import WorkbenchRail from './components/layout/WorkbenchRail.vue'
import ToastContainer from './components/layout/ToastContainer.vue'
import ExtensionCommandPalette from './components/extensions/ExtensionCommandPalette.vue'
import ExtensionWindowPrompt from './components/extensions/ExtensionWindowPrompt.vue'
import { useI18n } from './i18n'
import {
  getReferenceSectionLabelKey,
  getReferenceSourceLabelKey,
} from './domains/references/referencePresentation.js'
import {
  buildSurfaceContext,
} from './domains/extensions/extensionContributionRegistry'
import { resolveExtensionTargetContext } from './domains/extensions/extensionTargetContext'
import { resolvePaneDocumentDockOpen } from './domains/editor/paneDocumentDockRuntime.js'
import { useAppShellLayout } from './composables/useAppShellLayout'
import { useAppShellEventBridge } from './app/shell/useAppShellEventBridge'
import { useAppExtensionRuntimeBridge } from './app/shell/useAppExtensionRuntimeBridge'
import { applyAppWindowConstraints } from './app/shell/useAppWindowConstraints'
import { useAppTeardown } from './app/teardown/useAppTeardown'
import { useWorkspaceLifecycle } from './app/workspace/useWorkspaceLifecycle'
import { isNewTab, isPreviewPath, previewSourcePathFromPath } from './utils/fileTypes'
import { basenamePath } from './utils/path'
import { isMac } from './platform'
import { syncMacosWindowTransparency } from './services/macosWindowTransparency.js'

const LeftSidebar = defineAsyncComponent(() => import('./components/sidebar/LeftSidebar.vue'))
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
const extensionsStore = useExtensionsStore()
const extensionWindowUi = useExtensionWindowUiStore()
const toastStore = useToastStore()
const { t } = useI18n()
void applyAppWindowConstraints()

const isZenMode = ref(false)
const commandPaletteVisible = ref(false)

const supportsRightSidebar = computed(() => workspace.isOpen && workspace.isWorkspaceSurface)
const leftSidebarVisible = computed(
  () => workspace.isOpen && (workspace.isSettingsSurface || workspace.leftSidebarOpen)
)
const activeDocumentPreviewState = computed(() => {
  const activePath = editorStore.activeTab
  if (!activePath || isNewTab(activePath) || isPreviewPath(activePath)) return null
  return workflowStore.getWorkspacePreviewStateForFile(activePath) || null
})
const activeDocumentPreviewOpen = computed(
  () =>
    workspace.isOpen &&
    workspace.isWorkspaceSurface &&
    workspace.leftSidebarPanel !== 'references' &&
    activeDocumentPreviewState.value?.previewVisible === true
)
const referenceDetailOpen = computed(
  () =>
    workspace.isOpen &&
    workspace.isWorkspaceSurface &&
    workspace.leftSidebarPanel === 'references' &&
    workspace.referenceDockOpen
)
const documentInternalDockOpen = computed(
  () => resolvePaneDocumentDockOpen({
    hasWorkspace: workspace.isOpen,
    isWorkspaceSurface: workspace.isWorkspaceSurface,
    isReferencePanel: workspace.leftSidebarPanel === 'references',
    documentDockOpen: workspace.documentDockOpen,
    activeDocumentPreviewOpen: activeDocumentPreviewOpen.value,
  })
)
const rightRailOpen = computed(
  () => supportsRightSidebar.value && (documentInternalDockOpen.value || referenceDetailOpen.value)
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
      ? {
          referenceDetailOpen: referenceDetailOpen.value,
          referenceDetailWidth: referenceDockWidth.value,
          referenceDetailResizing: isRightSidebarResizing.value,
        }
      : {
          node: editorStore.paneTree,
          topbarTabsTargetSelector: '#app-shell-topbar-document-title',
          documentDockOpen: documentInternalDockOpen.value,
          documentDockWidth: documentDockWidth.value,
          documentDockResizing: isRightSidebarResizing.value,
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
    return basenamePath(sourcePath) || t('Preview')
  }
  return basenamePath(activePath) || activePath
})
const commandPaletteTarget = computed(() => {
  return resolveExtensionTargetContext({
    workspaceLeftSidebarPanel: workspace.leftSidebarPanel,
    selectedReference: referencesStore.selectedReference,
    activeTab: editorStore.activeTab,
  })
})
const extensionCommandContext = computed(() =>
  buildSurfaceContext(commandPaletteTarget.value, {
    workbench: {
      surface: workspace.isSettingsSurface ? 'settings' : 'workspace',
      panel: workspace.leftSidebarPanel || '',
      activeView: workspace.isSettingsSurface ? 'settings' : workspace.leftSidebarPanel || 'files',
      hasWorkspace: workspace.isOpen,
      workspaceFolder: workspace.path || '',
    },
  })
)

async function selectWorkbenchPanel(panel) {
  await workspace.openWorkspaceSurface()
  await workspace.setLeftSidebarPanel(panel)
  if (!workspace.leftSidebarOpen) {
    await workspace.toggleLeftSidebar()
  }
}

async function toggleRightDock() {
  if (!supportsRightSidebar.value) return

  if (workspace.leftSidebarPanel === 'references') {
    workspace.toggleReferenceDock()
    return
  }

  if (documentInternalDockOpen.value) {
    await closeDocumentDock()
    return
  }

  workspace.openDocumentDock()
}

async function closeDocumentDock() {
  if (workspace.leftSidebarPanel !== 'references' && workspace.documentDockOpen) {
    workspace.closeDocumentDock()
  }

  const activePath = editorStore.activeTab
  if (
    activeDocumentPreviewOpen.value &&
    activePath &&
    !isNewTab(activePath) &&
    !isPreviewPath(activePath)
  ) {
    await workflowStore.hideWorkspacePreviewForFile(activePath)
  }
}

function handleEditorTyping() {
  isZenMode.value = true
}

function handleMouseMoveBreakZen() {
  if (isZenMode.value) {
    isZenMode.value = false
  }
}

const {
  handleExtensionWindowPromptCancel,
  handleExtensionWindowPromptSubmit,
} = useAppExtensionRuntimeBridge({
  commandPaletteVisible,
  commandPaletteTarget,
  extensionCommandContext,
  extensionWindowUi,
  extensionsStore,
  toastStore,
  t,
})

onMounted(() => {
  if (isMac) {
    void syncMacosWindowTransparency()
  }
  window.addEventListener('editor-typing', handleEditorTyping)
  window.addEventListener('mousemove', handleMouseMoveBreakZen)
})

onBeforeUnmount(() => {
  window.removeEventListener('editor-typing', handleEditorTyping)
  window.removeEventListener('mousemove', handleMouseMoveBreakZen)
})

const {
  leftSidebarWidth,
  documentDockWidth,
  referenceDockWidth,
  isLeftSidebarResizing,
  isRightSidebarResizing,
  onLeftResize,
  startLeftSidebarResize,
  endLeftSidebarResize,
  setDocumentDockWidth,
  setReferenceDockWidth,
  snapDocumentDockWidth,
  snapReferenceDockWidth,
  startRightSidebarResize,
  endRightSidebarResize,
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
  void selection
}

function resolveActiveInlineDockLayoutControls() {
  return workspace.leftSidebarPanel === 'references'
    ? {
        setWidth: setReferenceDockWidth,
        snapWidth: snapReferenceDockWidth,
      }
    : {
        setWidth: setDocumentDockWidth,
        snapWidth: snapDocumentDockWidth,
      }
}

function onInlineDockResize(event = {}) {
  const controls = resolveActiveInlineDockLayoutControls()
  controls.setWidth(event.width, event.containerWidth, {
    minDockWidth: event.minDockWidth,
    minMainWidth: event.minMainWidth,
    maxContainerRatio: event.maxContainerRatio,
  })
}

function onInlineDockResizeSnap(event = {}) {
  const controls = resolveActiveInlineDockLayoutControls()
  controls.snapWidth(event.containerWidth, {
    minDockWidth: event.minDockWidth,
    minMainWidth: event.minMainWidth,
    maxContainerRatio: event.maxContainerRatio,
  })
}

useAppShellEventBridge({
  workspace,
  editorStore,
  filesStore,
  workflowStore,
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
</script>

<style scoped>
.app-shell-root {
  background: var(--app-canvas);
  --shell-panel-motion-duration: 390ms;
  --shell-panel-fade-duration: 210ms;
  --shell-panel-surface-duration: 180ms;
  --shell-panel-motion-ease: cubic-bezier(0.3, 0, 0.2, 1);
  --inline-dock-motion-duration: var(--shell-panel-motion-duration);
  --inline-dock-fade-duration: var(--shell-panel-fade-duration);
  --inline-dock-surface-duration: var(--shell-panel-surface-duration);
  --inline-dock-motion-ease: var(--shell-panel-motion-ease);
}

.app-shell-workspace {
  position: relative;
  min-height: 0;
}

:global(html.is-tauri-macos) .app-shell-root,
:global(html.is-tauri-macos) .app-shell-workspace,
:global(html.is-tauri-macos) .app-shell-workbench {
  background: transparent !important;
  background-color: transparent !important;
}

/* =========================================================================
   Zen Mode (Focus Fade-out Transitions)
========================================================================= */
.app-shell-topbar,
.app-shell-region-left,
.app-shell-region-right {
  transition:
    opacity var(--shell-panel-fade-duration) ease-out,
    width var(--shell-panel-motion-duration) var(--shell-panel-motion-ease);
}

/* 在打字时，侧边栏和顶栏在 1.5 秒后优雅地淡出到 8% 不透明度 */
.app-shell-root.is-zen-mode .app-shell-topbar:not(:hover),
.app-shell-root.is-zen-mode .app-shell-region-left:not(:hover),
.app-shell-root.is-zen-mode .app-shell-region-right:not(:hover) {
  opacity: 0.08;
  transition:
    opacity 1.5s ease-out 1.5s,
    width var(--shell-panel-motion-duration) var(--shell-panel-motion-ease);
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
  background:
    linear-gradient(to bottom, var(--sidebar-glass-highlight), transparent 44%),
    var(--sidebar-glass-surface);
  border-right: 1px solid var(--sidebar-glass-border);
  box-shadow:
    inset -1px 0 0 var(--sidebar-glass-highlight),
    1px 0 16px var(--sidebar-glass-shadow);
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  will-change: width;
}

.app-shell-region-left.is-workspace-left-region {
  background:
    linear-gradient(to bottom, var(--sidebar-glass-highlight), transparent 44%),
    var(--sidebar-glass-surface);
}

:global(html.is-tauri-macos.theme-dark) .app-shell-region-left,
:global(html.is-tauri-macos[data-theme-resolved='dark']) .app-shell-region-left {
  background:
    linear-gradient(to bottom, var(--sidebar-glass-highlight), transparent 44%),
    var(--sidebar-glass-surface);
  border-right-color: var(--sidebar-glass-border);
  box-shadow:
    inset -1px 0 0 var(--sidebar-glass-highlight),
    1px 0 16px var(--sidebar-glass-shadow);
}

.app-shell-region-main {
  background: transparent;
  overflow: visible;
}

.app-shell-region-right {
  background: transparent;
  will-change: width;
}

.app-shell-root.is-shell-resizing .app-shell-region-left,
.app-shell-root.is-shell-resizing .app-shell-region-right,
.app-shell-root.is-shell-resizing .app-shell-sidebar,
.app-shell-root.is-shell-resizing .app-shell-sidebar-left,
.app-shell-root.is-shell-resizing .app-shell-sidebar-right,
.app-shell-root.is-shell-resizing .app-shell-resize-slot,
.app-shell-root.is-shell-resizing .app-shell-resize-handle {
  transition: none !important;
}

.app-shell-root.is-shell-resizing .app-shell-main-card {
  transition: none !important;
}

.app-shell-root.is-shell-resizing .app-shell-main-card.has-left-sidebar {
  margin-left: 0;
  padding-left: 0;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.app-shell-sidebar {
  contain: layout paint;
  flex: 0 0 var(--app-shell-sidebar-width, 100%);
  min-width: var(--app-shell-sidebar-width, 100%);
  height: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  will-change: opacity, transform;
  opacity: 1;
  transform: translateX(0);
  transition:
    opacity var(--shell-panel-fade-duration) ease,
    transform var(--shell-panel-motion-duration) var(--shell-panel-motion-ease),
    background-color var(--shell-panel-surface-duration) ease;
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
    transform var(--shell-panel-motion-duration) var(--shell-panel-motion-ease),
    background-color var(--shell-panel-surface-duration) ease;
}

.app-shell-sidebar-left.is-open,
.app-shell-sidebar-right.is-open {
  transition-delay: 8ms;
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
    margin-left var(--shell-panel-motion-duration) var(--shell-panel-motion-ease),
    padding-left var(--shell-panel-motion-duration) var(--shell-panel-motion-ease),
    margin-right var(--shell-panel-motion-duration) var(--shell-panel-motion-ease),
    padding-right var(--shell-panel-motion-duration) var(--shell-panel-motion-ease),
    border-radius var(--shell-panel-motion-duration) var(--shell-panel-motion-ease);
}

.app-shell-main-card.is-empty-workspace-shell {
  padding-top: 0;
}

.app-shell-main-card.is-workspace-surface-shell {
  padding-top: 36px;
}

.app-shell-main-card.has-left-sidebar {
  margin-left: 0;
  padding-left: 0;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.app-shell-main-card.has-right-sidebar {
  margin-right: 0;
  padding-right: 0;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.app-shell-resize-slot {
  flex: 0 0 auto;
  position: relative;
  z-index: 5;
  width: 0;
  overflow: visible;
  opacity: 0;
  transition:
    width var(--shell-panel-motion-duration) var(--shell-panel-motion-ease),
    opacity var(--shell-panel-surface-duration) ease;
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
  left: -4px;
}

.app-shell-resize-handle-right {
  right: -14px;
}

@media (prefers-reduced-motion: reduce) {
  .app-shell-root {
    --shell-panel-motion-duration: 1ms;
    --shell-panel-fade-duration: 1ms;
    --shell-panel-surface-duration: 1ms;
  }
}
</style>
