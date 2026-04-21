<template>
  <div class="right-shell-sidebar" data-surface-context-guard="true">
    <KeepAlive :max="2">
      <ReferenceDetailPanel
        v-if="workspace.rightSidebarOpen && workspace.leftSidebarPanel === 'references'"
        key="workspace-reference-detail"
        class="right-shell-pane"
      />
      <OutlinePanel
        v-else-if="workspace.rightSidebarOpen"
        key="workspace-outline"
        embedded
        :overrideActiveFile="documentTab"
        class="right-shell-pane"
      />
    </KeepAlive>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useWorkspaceStore } from '../../stores/workspace'
import { isNewTab } from '../../utils/fileTypes'

const OutlinePanel = defineAsyncComponent(() => import('../panel/OutlinePanel.vue'))
const ReferenceDetailPanel = defineAsyncComponent(() => import('../panel/ReferenceDetailPanel.vue'))

const editorStore = useEditorStore()
const workspace = useWorkspaceStore()

const lastDocumentTab = ref(null)

const documentTab = computed(() => {
  const active = editorStore.activeTab
  if (active && !isNewTab(active)) {
    return active
  }
  return lastDocumentTab.value
})

watch(
  () => editorStore.activeTab,
  (tab) => {
    if (tab && !isNewTab(tab)) {
      lastDocumentTab.value = tab
    }
  },
  { flush: 'post', immediate: true }
)
</script>

<style scoped>
.right-shell-sidebar {
  --sidebar-shell-top: 42px;
  --sidebar-shell-inline: 8px;
  --sidebar-shell-bottom: 2px;
  display: flex;
  flex-direction: column;
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: var(--sidebar-shell-top) var(--sidebar-shell-inline) var(--sidebar-shell-bottom);
  background: var(
    --sidebar-shell-surface,
    color-mix(in srgb, var(--panel-surface) 56%, transparent)
  );
  box-shadow: none;
  backdrop-filter: blur(var(--sidebar-shell-blur, 18px))
    saturate(var(--sidebar-shell-saturate, 1.08));
}

.right-shell-pane {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  border-radius: 0;
  background: transparent;
}
</style>
