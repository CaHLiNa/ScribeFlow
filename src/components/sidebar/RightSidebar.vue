<template>
  <div class="right-shell-sidebar">
    <KeepAlive :max="3">
      <component
        :is="activeSidebarView.component"
        :key="activeSidebarView.key"
        v-bind="activeSidebarView.props"
        class="right-shell-pane"
      />
    </KeepAlive>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch, KeepAlive } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useWorkspaceStore } from '../../stores/workspace'
import { normalizeWorkbenchInspectorPanel } from '../../shared/workbenchInspectorPanels.js'
import { isAiLauncher, isChatTab, isLibraryPath, isNewTab } from '../../utils/fileTypes'

const OutlinePanel = defineAsyncComponent(() => import('../panel/OutlinePanel.vue'))
const Backlinks = defineAsyncComponent(() => import('../panel/Backlinks.vue'))
const LibraryInspectorSidebar = defineAsyncComponent(() => import('./LibraryInspectorSidebar.vue'))

const editorStore = useEditorStore()
const workspace = useWorkspaceStore()

const lastDocumentTab = ref(null)

const activePanel = computed(() => (
  normalizeWorkbenchInspectorPanel(workspace.primarySurface, workspace.rightSidebarPanel)
))
const activeSidebarView = computed(() => {
  if (workspace.isLibrarySurface) {
    return {
      component: LibraryInspectorSidebar,
      key: 'library-details',
      props: {},
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
      overrideActiveFile: documentTab.value,
    },
  }
})

const documentTab = computed(() => {
  const active = editorStore.activeTab
  if (
    active
    && !isChatTab(active)
    && !isAiLauncher(active)
    && !isNewTab(active)
    && !isLibraryPath(active)
  ) {
    return active
  }
  return lastDocumentTab.value
})

watch(
  () => editorStore.activeTab,
  (tab) => {
    if (
      tab
      && !isChatTab(tab)
      && !isAiLauncher(tab)
      && !isNewTab(tab)
      && !isLibraryPath(tab)
    ) {
      lastDocumentTab.value = tab
    }
  },
  { flush: 'post', immediate: true },
)
</script>

<style scoped>
.right-shell-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-secondary);
}

.right-shell-pane {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
</style>
