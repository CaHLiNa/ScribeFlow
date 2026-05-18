<template>
  <ContextMenu
    v-if="contextMenuVisible"
    :x="contextMenuX"
    :y="contextMenuY"
    :entry="contextMenuEntry"
    :selected-count="selectedCount"
    @close="$emit('close-context-menu')"
    @create="$emit('context-create', $event)"
    @rename="$emit('context-rename', $event)"
    @duplicate="$emit('context-duplicate', $event)"
    @delete="$emit('context-delete', $event)"
    @delete-selected="$emit('context-delete-selected')"
    @reveal-in-finder="$emit('context-reveal-in-finder', $event)"
    @open-in-document-dock="$emit('context-open-in-document-dock', $event)"
  />

  <FileTreeWorkspaceMenu
    ref="workspaceMenuComponent"
    :open="workspaceMenuOpen"
    :menu-style="workspaceMenuStyle"
    :recent-workspaces="recentWorkspaces"
    @open-folder="$emit('workspace-open-folder')"
    @open-settings="$emit('workspace-open-settings')"
    @open-recent="$emit('workspace-open-recent', $event)"
    @close-folder="$emit('workspace-close-folder')"
  />

  <FileTreeNewMenu
    ref="newMenuComponent"
    :open="newMenuOpen"
    :menu-style="newMenuStyle"
    :document-templates="documentTemplates"
    @close="$emit('new-menu-close')"
    @create="$emit('new-menu-create', $event)"
  />

  <Teleport to="body">
    <div
      v-if="dragGhostVisible"
      class="tab-ghost"
      :style="{ left: dragGhostX + 'px', top: dragGhostY + 'px' }"
    >
      {{ dragGhostLabel }}
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import ContextMenu from './ContextMenu.vue'
import FileTreeNewMenu from './FileTreeNewMenu.vue'
import FileTreeWorkspaceMenu from './FileTreeWorkspaceMenu.vue'

defineEmits([
  'close-context-menu',
  'context-create',
  'context-rename',
  'context-duplicate',
  'context-delete',
  'context-delete-selected',
  'context-reveal-in-finder',
  'context-open-in-document-dock',
  'workspace-open-folder',
  'workspace-open-settings',
  'workspace-open-recent',
  'workspace-close-folder',
  'new-menu-close',
  'new-menu-create',
])

defineProps({
  contextMenuVisible: { type: Boolean, default: false },
  contextMenuX: { type: Number, default: 0 },
  contextMenuY: { type: Number, default: 0 },
  contextMenuEntry: { type: Object, default: null },
  selectedCount: { type: Number, default: 0 },
  workspaceMenuOpen: { type: Boolean, default: false },
  workspaceMenuStyle: { type: Object, default: () => ({}) },
  recentWorkspaces: { type: Array, default: () => [] },
  newMenuOpen: { type: Boolean, default: false },
  newMenuStyle: { type: Object, default: () => ({}) },
  documentTemplates: { type: Array, default: () => [] },
  dragGhostVisible: { type: Boolean, default: false },
  dragGhostX: { type: Number, default: 0 },
  dragGhostY: { type: Number, default: 0 },
  dragGhostLabel: { type: String, default: '' },
})

const workspaceMenuComponent = ref(null)
const newMenuComponent = ref(null)

defineExpose({
  getWorkspaceMenuElement() {
    return workspaceMenuComponent.value?.menuEl || null
  },
  getNewMenuElement() {
    return newMenuComponent.value?.menuEl || null
  },
})
</script>
