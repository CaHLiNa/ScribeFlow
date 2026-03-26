<template>
  <div class="right-shell-sidebar">
    <SidebarChrome
      v-if="workspace.rightSidebarOpen"
      :entries="inspectorEntries"
      :active-key="activePanel"
      @select="selectInspectorPanel"
    />

    <KeepAlive :max="4">
      <component
        v-if="workspace.rightSidebarOpen"
        :is="activeSidebarView.component"
        :key="activeSidebarView.key"
        v-bind="activeSidebarView.props"
        class="right-shell-pane"
      />
    </KeepAlive>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useEditorStore } from '../../stores/editor'
import { useWorkspaceStore } from '../../stores/workspace'
import { normalizeWorkbenchInspectorPanel } from '../../shared/workbenchInspectorPanels.js'
import { getWorkbenchInspectorChromeEntries } from '../../shared/workbenchChromeEntries.js'
import { isAiLauncher, isChatTab, isLatex, isLibraryPath, isNewTab, isTypst } from '../../utils/fileTypes'
import { useI18n } from '../../i18n'
import SidebarChrome from '../shared/SidebarChrome.vue'

const OutlinePanel = defineAsyncComponent(() => import('../panel/OutlinePanel.vue'))
const Backlinks = defineAsyncComponent(() => import('../panel/Backlinks.vue'))
const LibraryInspectorSidebar = defineAsyncComponent(() => import('./LibraryInspectorSidebar.vue'))
const DocumentRunInspectorSidebar = defineAsyncComponent(() => import('./DocumentRunInspectorSidebar.vue'))

const workflowStore = useDocumentWorkflowStore()
const editorStore = useEditorStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()

const lastDocumentTab = ref(null)

function resolveDocumentSourcePath(path) {
  if (!path) return ''
  return workflowStore.getSourcePathForPreview(path) || path
}

const activeSidebarView = computed(() => {
  if (workspace.isLibrarySurface) {
    return {
      component: LibraryInspectorSidebar,
      key: 'library-details',
      props: {},
    }
  }

  if (activePanel.value === 'document-run') {
    return {
      component: DocumentRunInspectorSidebar,
      key: 'workspace-document-run',
      props: {
        overrideActiveFile: currentWorkspaceDocumentTab.value,
      },
    }
  }

  if (activePanel.value === 'outline') {
    return {
      component: OutlinePanel,
      key: 'workspace-outline',
      props: {
        embedded: true,
        overrideActiveFile: documentTab.value,
      },
    }
  }

  return {
    component: Backlinks,
    key: 'workspace-backlinks',
    props: {
      embedded: true,
      overrideActiveFile: documentTab.value,
    },
  }
})

const documentTab = computed(() => {
  const active = editorStore.activeTab
  if (
    active &&
    !isChatTab(active) &&
    !isAiLauncher(active) &&
    !isNewTab(active) &&
    !isLibraryPath(active)
  ) {
    return active
  }
  return lastDocumentTab.value
})

const currentWorkspaceDocumentTab = computed(() => {
  const active = editorStore.activeTab
  if (
    active &&
    !isChatTab(active) &&
    !isAiLauncher(active) &&
    !isNewTab(active) &&
    !isLibraryPath(active)
  ) {
    return active
  }
  return ''
})

const showDocumentRunEntry = computed(() => {
  if (workspace.primarySurface !== 'workspace') return false
  const sourcePath = resolveDocumentSourcePath(currentWorkspaceDocumentTab.value)
  if (!sourcePath) return false
  return isLatex(sourcePath) || isTypst(sourcePath)
})

const activePanel = computed(() => {
  const normalized = normalizeWorkbenchInspectorPanel(
    workspace.primarySurface,
    workspace.rightSidebarPanel
  )
  if (normalized === 'document-run' && !showDocumentRunEntry.value) {
    return 'outline'
  }
  return normalized
})

const inspectorEntries = computed(() => {
  const entries = getWorkbenchInspectorChromeEntries(t, workspace.primarySurface)
  if (workspace.primarySurface !== 'workspace') return entries
  return showDocumentRunEntry.value
    ? entries
    : entries.filter((entry) => entry.key !== 'document-run')
})

watch(
  () => editorStore.activeTab,
  (tab) => {
    if (tab && !isChatTab(tab) && !isAiLauncher(tab) && !isNewTab(tab) && !isLibraryPath(tab)) {
      lastDocumentTab.value = tab
    }
  },
  { flush: 'post', immediate: true }
)

watch(showDocumentRunEntry, (visible) => {
  if (!visible && workspace.rightSidebarPanel === 'document-run') {
    workspace.setRightSidebarPanel('outline')
  }
}, { immediate: true })

function selectInspectorPanel(panel) {
  workspace.setRightSidebarPanel(panel)
  workspace.openRightSidebar()
}
</script>

<style scoped>
.right-shell-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-primary);
}

.right-shell-pane {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
</style>
