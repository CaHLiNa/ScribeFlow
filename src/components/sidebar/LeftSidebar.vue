<template>
  <div class="left-shell-sidebar">
    <FileTree
      v-if="workspace.leftSidebarPanel === 'files'"
      ref="activeSidebarRef"
      :collapsed="false"
      :embedded="true"
      :heading-collapsible="false"
      :heading-label="fileTreeHeadingLabel"
      @open-settings="$emit('open-settings')"
      @open-folder="$emit('open-folder')"
      @open-workspace="$emit('open-workspace', $event)"
      @close-folder="$emit('close-folder')"
    />
    <ReferencesSidebarPanel
      v-else
      ref="activeSidebarRef"
      @open-settings="$emit('open-settings')"
    />
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import FileTree from './FileTree.vue'
import ReferencesSidebarPanel from './ReferencesSidebarPanel.vue'

defineEmits([
  'open-settings',
  'open-folder',
  'open-workspace',
  'close-folder',
])

const workspace = useWorkspaceStore()
const activeSidebarRef = ref(null)
const fileTreeHeadingLabel = computed(() => '')

async function focusFileTree(method, ...args) {
  if (!workspace.isWorkspaceSurface) {
    workspace.openWorkspaceSurface()
    await nextTick()
  }
  activeSidebarRef.value?.[method]?.(...args)
}

function collapseSidebarFolders() {
  activeSidebarRef.value?.collapseAllFolders?.()
}

function openSidebarCreateMenu(anchorEl = null) {
  activeSidebarRef.value?.toggleCreateMenuFrom?.(anchorEl)
}

// Expose FileTree methods for App.vue
defineExpose({
  async beginNewFile(ext = '.md') {
    await focusFileTree('beginNewFile', ext)
  },
  async createNewFile(ext = '.md') {
    await focusFileTree('createNewFile', ext)
  },
  async activateFilter() {
    await focusFileTree('activateFilter')
  },
  collapseAllFolders() {
    collapseSidebarFolders()
  },
  openCreateMenuFrom(anchorEl = null) {
    openSidebarCreateMenu(anchorEl)
  },
})
</script>

<style scoped>
.left-shell-sidebar {
  display: flex;
  flex-direction: column;
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 30px 10px 10px;
  background: var(--sidebar-shell-surface, color-mix(in srgb, var(--panel-surface) 56%, transparent));
  box-shadow: none;
  backdrop-filter: blur(var(--sidebar-shell-blur, 18px)) saturate(var(--sidebar-shell-saturate, 1.08));
}

.left-shell-sidebar > :last-child {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
