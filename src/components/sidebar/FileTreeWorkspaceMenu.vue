<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="menuEl"
      class="context-menu file-tree-workspace-menu file-tree-workspace-menu-popover"
      :style="menuStyle"
      role="menu"
      :aria-label="t('Workspace Menu')"
    >
      <button
        type="button"
        class="context-menu-item file-tree-workspace-item"
        role="menuitem"
        @click="$emit('open-folder')"
      >
        <span class="file-tree-workspace-item-label">{{ t('Open Folder...') }}</span>
        <span class="context-menu-ext file-tree-workspace-shortcut">{{ modKey }}+O</span>
      </button>
      <button
        type="button"
        class="context-menu-item file-tree-workspace-item"
        role="menuitem"
        @click="$emit('open-settings')"
      >
        <span class="file-tree-workspace-item-label">{{ t('Settings...') }}</span>
        <span class="context-menu-ext file-tree-workspace-shortcut">{{ modKey }},</span>
      </button>
      <template v-if="recentWorkspaces.length">
        <div class="context-menu-separator"></div>
        <div class="context-menu-section">{{ t('Recent') }}</div>
        <button
          v-for="recent in recentWorkspaces"
          :key="recent.path"
          type="button"
          class="context-menu-item file-tree-workspace-item"
          role="menuitem"
          :title="recent.name"
          @click="$emit('open-recent', recent.path)"
        >
          <span class="file-tree-workspace-item-label">{{ recent.name }}</span>
        </button>
      </template>
      <div class="context-menu-separator"></div>
      <button
        type="button"
        class="context-menu-item file-tree-workspace-item"
        role="menuitem"
        @click="$emit('close-folder')"
      >
        <span class="file-tree-workspace-item-label">{{ t('Close Folder') }}</span>
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from '../../i18n'
import { modKey } from '../../platform'

defineEmits(['close-folder', 'open-folder', 'open-recent', 'open-settings'])

defineProps({
  open: { type: Boolean, default: false },
  menuStyle: { type: Object, default: () => ({}) },
  recentWorkspaces: { type: Array, default: () => [] },
})

const menuEl = ref(null)
const { t } = useI18n()

defineExpose({
  menuEl,
})
</script>

<style scoped>
.file-tree-workspace-shortcut {
  opacity: 1;
}

.file-tree-workspace-menu {
  max-height: min(50vh, 420px);
  overflow-y: auto;
}

.file-tree-workspace-menu-popover {
  position: fixed !important;
  width: min(240px, calc(100vw - 16px));
  max-width: min(240px, calc(100vw - 16px));
}

.file-tree-workspace-item {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
}

.file-tree-workspace-item-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
