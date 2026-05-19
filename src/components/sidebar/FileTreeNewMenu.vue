<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="context-menu-backdrop"
      @mousedown.prevent.stop="$emit('close')"
      @contextmenu.prevent.stop="$emit('close')"
    ></div>
    <div
      v-if="open"
      ref="menuEl"
      class="context-menu file-tree-new-menu"
      :style="menuStyle"
      @contextmenu.prevent.stop
    >
      <button
        type="button"
        class="context-menu-item"
        @click.stop="$emit('create', { ext: null, isDir: true })"
      >
        <IconFolderPlus :size="14" :stroke-width="1.5" />
        <span class="file-tree-workspace-item-label">{{ t('New Folder') }}</span>
      </button>
      <button
        type="button"
        class="context-menu-item"
        @click.stop="$emit('create', { ext: null })"
      >
        <IconFilePlus :size="14" :stroke-width="1.5" />
        <span class="file-tree-workspace-item-label">{{ t('New File...') }}</span>
      </button>
      <div class="context-menu-separator"></div>
      <button
        v-for="template in documentTemplates"
        :key="template.id"
        type="button"
        class="context-menu-item"
        @click.stop="
          $emit('create', {
            ext: template.ext,
            suggestedName: template.filename,
            initialContent: template.content,
          })
        "
      >
        <component
          :is="template.ext === '.tex' ? IconMath : IconFileText"
          :size="14"
          :stroke-width="1.5"
        />
        <span class="file-tree-workspace-item-label">{{ template.label }}</span>
        <span class="context-menu-ext">{{ template.ext }}</span>
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { IconFilePlus, IconFileText, IconFolderPlus, IconMath } from '@tabler/icons-vue'
import { useI18n } from '../../i18n'

defineEmits(['close', 'create'])

defineProps({
  open: { type: Boolean, default: false },
  menuStyle: { type: Object, default: () => ({}) },
  documentTemplates: { type: Array, default: () => [] },
})

const menuEl = ref(null)
const { t } = useI18n()

defineExpose({
  menuEl,
})
</script>

<style scoped>
.file-tree-new-menu {
  min-width: 200px !important;
  max-height: min(50vh, 360px);
  overflow-y: auto;
}

.file-tree-workspace-item-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
