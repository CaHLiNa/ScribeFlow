<template>
  <div
    class="file-tree-header flex items-center h-7 shrink-0 px-2 gap-1 select-none"
    :class="{ 'file-tree-header--with-divider': !collapsed && !embedded }"
  >
    <div
      class="flex items-center gap-1 min-w-0 flex-1"
      :class="{ 'cursor-pointer': headingCollapsible }"
      @click="headingCollapsible ? $emit('toggle-collapse') : null"
    >
      <svg
        v-if="headingCollapsible"
        width="13"
        height="13"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        class="file-tree-chevron"
        :class="{ 'file-tree-chevron-open': !collapsed }"
      >
        <path d="M6 4l4 4-4 4" />
      </svg>
      <span class="ui-sidebar-kicker truncate min-w-0">{{ headingLabel || workspaceName }}</span>
    </div>
    <div v-if="!collapsed" class="flex items-center gap-1 shrink-0">
      <UiButton
        class="file-tree-header-action"
        variant="ghost"
        size="icon-sm"
        icon-only
        :title="t('Collapse All Folders')"
        :aria-label="t('Collapse All Folders')"
        @click.stop="$emit('collapse-all')"
      >
        <IconFolderMinus :size="17" :stroke-width="1.75" />
      </UiButton>
      <UiButton
        class="file-tree-header-action"
        variant="ghost"
        size="icon-sm"
        icon-only
        :title="t('New File or Folder')"
        :aria-label="t('New File or Folder')"
        @click.stop="$emit('toggle-new-menu', $event.currentTarget)"
      >
        <IconPlus :size="15" :stroke-width="1.9" />
      </UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconFolderMinus, IconPlus } from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'

defineEmits(['collapse-all', 'toggle-collapse', 'toggle-new-menu'])

defineProps({
  collapsed: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
  headingCollapsible: { type: Boolean, default: true },
  headingLabel: { type: String, default: '' },
  workspaceName: { type: String, default: '' },
})

const { t } = useI18n()
</script>

<style scoped>
.file-tree-header {
  color: var(--text-muted);
}

.file-tree-header-action {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  color: color-mix(in srgb, var(--text-muted) 90%, transparent);
}

.file-tree-header--with-divider {
  border-bottom: 0;
}

.file-tree-chevron {
  transition: transform 0.1s ease;
}

.file-tree-chevron-open {
  transform: rotate(90deg);
}
</style>
