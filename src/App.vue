--- START OF FILE src/App.vue ---

<template>
  <AppShellFrame
    :current-document-label="currentDocumentLabel"
    :is-left-sidebar-resizing="isLeftSidebarResizing"
    :is-right-sidebar-resizing="isRightSidebarResizing"
    :is-workspace-open="workspace.isOpen"
    :is-workspace-surface="workspace.isWorkspaceSurface"
    :is-zen-mode="isZenMode"
    :context-dock-available="contextDockState.available"
    :context-dock-label="t(contextDockState.toggleLabelKey)"
    :context-dock-open="contextDockState.open"
    :left-sidebar-visible="leftSidebarVisible"
    :left-sidebar-width="leftSidebarWidth"
    :workbench-mode="workbenchMode"
    @left-resize="onLeftResize"
    @left-resize-end="endLeftSidebarResize"
    @left-resize-start="startLeftSidebarResize"
    @select-workbench-mode="selectWorkbenchMode"
    @toggle-left-sidebar="workspace.toggleLeftSidebar()"
    @toggle-context-dock="toggleContextDock"
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

import AppShellFrame from './components/layout/AppShellFrame.vue'
import ToastContainer from './components/layout/ToastContainer.vue'
import { useI18n } from './i18n'
import {
  getReferenceSectionLabelKey,
  getReferenceSourceLabelKey,
} from './domains/references/referencePresentation.ts'
import { resolveSettingsSectionMeta } from './domains/settings/settingsSections.ts'
import { resolvePaneDocumentDockOpen } from './domains/editor/paneDocumentDockRuntime.ts'
import {
  CONTEXT_DOCK_REFERENCE,
  WORKBENCH_MODE_DOCUMENTS,
  WORKBENCH_MODE_REFERENCES,
  WORKBENCH_MODE_SETTINGS,
  leftSidebarPanelForWorkbenchMode,
  normalizeWorkbenchMode,
  resolveContextDockState,
  resolveWorkbenchMode,
} from './domains/workbench/workbenchShellPresentation.ts'
import { useAppShellLayout } from './composables/useAppShellLayout'
import { useAppShellEventBridge } from './app/shell/useAppShellEventBridge'
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
const { t } = useI18n()
void applyAppWindowConstraints()

const isZenMode = ref(false)

const workbenchMode = computed(() =>
  resolveWorkbenchMode({
    isSettingsSurface: workspace.isSettingsSurface,
    leftSidebarPanel: workspace.leftSidebarPanel,
  })
)
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
    workbenchMode.value === WORKBENCH_MODE_DOCUMENTS &&
    activeDocumentPreviewState.value?.previewVisible === true
)
const referenceDetailOpen = computed(
  () =>
    workspace.isOpen &&
    workspace.isWorkspaceSurface &&
    workbenchMode.value === WORKBENCH_MODE_REFERENCES &&
    workspace.referenceDockOpen
)
const documentInternalDockOpen = computed(
  () => resolvePaneDocumentDockOpen({
    hasWorkspace: workspace.isOpen,
    isWorkspaceSurface: workspace.isWorkspaceSurface,
    isReferencePanel: workbenchMode.value === WORKBENCH_MODE_REFERENCES,
    documentDockOpen: workspace.documentDockOpen,
    activeDocumentPreviewOpen: activeDocumentPreviewOpen.value,
  })
)
const contextDockState = computed(() =>
  resolveContextDockState({
    hasWorkspace: workspace.isOpen,
    isWorkspaceSurface: workspace.isWorkspaceSurface,
    workbenchMode: workbenchMode.value,
    documentDockOpen: documentInternalDockOpen.value,
    referenceDockOpen: referenceDetailOpen.value,
  })
)
const activeWorkbenchComponent = computed(() => {
  if (workbenchMode.value === WORKBENCH_MODE_SETTINGS) return Settings
  if (workbenchMode.value === WORKBENCH_MODE_REFERENCES) return ReferenceLibraryWorkbench
  return PaneContainer
})
const activeWorkbenchCacheKey = computed(() => {
  if (workbenchMode.value === WORKBENCH_MODE_SETTINGS) return WORKBENCH_MODE_SETTINGS
  return `workspace:${workbenchMode.value}`
})
const activeWorkbenchProps = computed(() =>
  workbenchMode.value === WORKBENCH_MODE_SETTINGS
    ? {}
    : workbenchMode.value === WORKBENCH_MODE_REFERENCES
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
  if (workbenchMode.value === WORKBENCH_MODE_SETTINGS) {
    return resolveSettingsSectionMeta({
      sectionId: workspace.settingsSection,
      translate: t,
    }).activeSectionMeta?.label || t('Settings')
  }
  if (workbenchMode.value === WORKBENCH_MODE_REFERENCES) {
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
async function selectWorkbenchMode(mode) {
  const nextMode = normalizeWorkbenchMode(mode)
  if (nextMode === WORKBENCH_MODE_SETTINGS) {
    workspace.openSettings()
    return
  }

  await workspace.openWorkspaceSurface()
  await workspace.setLeftSidebarPanel(leftSidebarPanelForWorkbenchMode(nextMode))
  if (!workspace.leftSidebarOpen) {
    await workspace.toggleLeftSidebar()
  }
}

async function toggleContextDock() {
  if (!contextDockState.value.available) return

  if (contextDockState.value.kind === CONTEXT_DOCK_REFERENCE) {
    await workspace.toggleReferenceDock()
    return
  }

  if (documentInternalDockOpen.value) {
    await closeDocumentDock()
    return
  }

  workspace.openDocumentDock()
}

async function closeDocumentDock() {
  if (workbenchMode.value === WORKBENCH_MODE_DOCUMENTS && workspace.documentDockOpen) {
    await workspace.closeDocumentDock()
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
    () => workbenchMode.value,
    () => workspace.documentDockOpen,
    () => workspace.referenceDockOpen,
  ],
  ([activeTab, previewMode, activeMode]) => {
    if (
      isPdf(activeTab) ||
      isPreviewPath(activeTab) ||
      previewMode === 'pdf-artifact' ||
      activeMode === WORKBENCH_MODE_REFERENCES
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
  return contextDockState.value.kind === CONTEXT_DOCK_REFERENCE
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
