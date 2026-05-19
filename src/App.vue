--- START OF FILE src/App.vue ---

<template>
  <AppShellFrame
    :current-document-label="currentDocumentLabel"
    :is-left-sidebar-resizing="isLeftSidebarResizing"
    :is-right-sidebar-resizing="isRightSidebarResizing"
    :is-workspace-open="workspace.isOpen"
    :is-workspace-surface="workspace.isWorkspaceSurface"
    :is-zen-mode="isZenMode"
    :left-sidebar-panel="workspace.leftSidebarPanel"
    :left-sidebar-visible="leftSidebarVisible"
    :left-sidebar-width="leftSidebarWidth"
    :right-rail-open="rightRailOpen"
    :supports-right-sidebar="supportsRightSidebar"
    @left-resize="onLeftResize"
    @left-resize-end="endLeftSidebarResize"
    @left-resize-start="startLeftSidebarResize"
    @select-workbench-panel="selectWorkbenchPanel"
    @toggle-left-sidebar="workspace.toggleLeftSidebar()"
    @toggle-right-sidebar="toggleRightDock"
  >
    <template #left-sidebar>
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
    </template>

    <template #main-workbench>
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
    </template>

    <template #overlays>
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

      <ToastContainer />
    </template>
  </AppShellFrame>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, onMounted, onBeforeUnmount, watch } from 'vue'
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

import AppShellFrame from './components/layout/AppShellFrame.vue'
import ToastContainer from './components/layout/ToastContainer.vue'
import ExtensionCommandPalette from './components/extensions/ExtensionCommandPalette.vue'
import ExtensionWindowPrompt from './components/extensions/ExtensionWindowPrompt.vue'
import { useI18n } from './i18n'
import {
  getReferenceSectionLabelKey,
  getReferenceSourceLabelKey,
} from './domains/references/referencePresentation.ts'
import {
  buildSurfaceContext,
} from './domains/extensions/extensionContributionRegistry'
import { resolveExtensionTargetContext } from './domains/extensions/extensionTargetContext'
import { resolvePaneDocumentDockOpen } from './domains/editor/paneDocumentDockRuntime.ts'
import { useAppShellLayout } from './composables/useAppShellLayout'
import { useAppShellEventBridge } from './app/shell/useAppShellEventBridge'
import { useAppExtensionRuntimeBridge } from './app/shell/useAppExtensionRuntimeBridge'
import { applyAppWindowConstraints } from './app/shell/useAppWindowConstraints'
import { useAppTeardown } from './app/teardown/useAppTeardown'
import { useWorkspaceLifecycle } from './app/workspace/useWorkspaceLifecycle'
import { isNewTab, isPdf, isPreviewPath, previewSourcePathFromPath } from './utils/fileTypes'
import { basenamePath } from './utils/path'
import { isMac } from './platform'
import { syncMacosWindowTransparency } from './services/macosWindowTransparency.ts'

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

function clearZenMode() {
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

watch(
  [
    () => editorStore.activeTab,
    () => activeDocumentPreviewState.value?.previewMode,
    () => workspace.leftSidebarPanel,
    () => workspace.documentDockOpen,
    () => workspace.referenceDockOpen,
  ],
  ([activeTab, previewMode, leftSidebarPanel]) => {
    if (
      isPdf(activeTab) ||
      isPreviewPath(activeTab) ||
      previewMode === 'pdf-artifact' ||
      leftSidebarPanel === 'references'
    ) {
      clearZenMode()
    }
  },
  { flush: 'post' }
)

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
