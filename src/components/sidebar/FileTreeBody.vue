<template>
  <div class="file-tree-body">
    <div
      ref="treeContainer"
      class="file-tree-scroll outline-none"
      tabindex="0"
      @contextmenu.prevent="$emit('context-menu-empty', $event)"
      @keydown="$emit('tree-keydown', $event)"
      @mouseup="$emit('tree-mouse-up', $event)"
      @scroll="$emit('tree-scroll', $event)"
    >
      <div
        v-if="rootNewActive"
        class="file-tree-root-rename-row flex items-center py-0.5 px-1"
      >
        <UiInput
          ref="renameInput"
          :model-value="rootNewValue"
          size="sm"
          shell-class="file-tree-rename-input"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          @update:modelValue="$emit('root-rename-value-change', $event)"
          @keydown.enter.stop="$emit('root-rename-submit')"
          @keydown.escape.stop="$emit('root-rename-cancel')"
          @blur="$emit('root-rename-submit')"
        />
      </div>

      <div v-if="visibleRowCount > 0" class="relative" :style="{ height: `${totalTreeHeight}px` }">
        <div :style="{ transform: `translateY(${virtualOffset}px)` }">
          <FileTreeItem
            v-for="row in virtualRows"
            :key="row.entry.path"
            :entry="row.entry"
            :depth="row.depth"
            :renamingPath="renamingPath"
            :newItemParent="newItemParent"
            :newItemValue="newItemValue"
            :newItemIsDir="newItemIsDir"
            :selectedPaths="selectedPaths"
            :dragOverDir="dragOverDir"
            :suppressChildren="true"
            @open-file="$emit('open-file', $event)"
            @select-file="$emit('select-file', $event)"
            @context-menu="$emit('show-context-menu', $event)"
            @start-rename-input="$emit('start-rename-input')"
            @rename-input-change="$emit('rename-input-change', $event)"
            @rename-input-submit="$emit('rename-input-submit')"
            @rename-input-cancel="$emit('rename-input-cancel')"
            @drag-start="$emit('drag-start', $event)"
            @drag-over-dir="$emit('drag-over-dir', $event)"
            @drag-leave-dir="$emit('drag-leave-dir', $event)"
            @drop-on-dir="$emit('drop-on-dir', $event)"
          />
        </div>
      </div>

      <div
        v-if="externalDragOver"
        class="file-tree-drop-indicator mx-2 my-1 py-2 rounded border-2 border-dashed text-center ui-sidebar-meta"
      >
        {{ t('Drop files here') }}
      </div>

      <div
        v-if="visibleRowCount === 0 && !renamingActive"
        class="file-tree-empty-state px-3 py-4 ui-sidebar-empty"
      >
        {{ t('No files yet') }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from '../../i18n'
import FileTreeItem from './FileTreeItem.vue'
import UiInput from '../shared/ui/UiInput.vue'

const emit = defineEmits([
  'context-menu-empty',
  'drag-leave-dir',
  'drag-over-dir',
  'drag-start',
  'drop-on-dir',
  'open-file',
  'rename-input-cancel',
  'rename-input-change',
  'rename-input-submit',
  'root-rename-cancel',
  'root-rename-submit',
  'root-rename-value-change',
  'select-file',
  'show-context-menu',
  'start-rename-input',
  'tree-container-ready',
  'tree-keydown',
  'tree-mouse-up',
  'tree-scroll',
])

defineProps({
  dragOverDir: { type: String, default: null },
  externalDragOver: { type: Boolean, default: false },
  newItemIsDir: { type: Boolean, default: false },
  newItemParent: { type: String, default: null },
  newItemValue: { type: String, default: '' },
  renamingActive: { type: Boolean, default: false },
  renamingPath: { type: String, default: null },
  rootNewActive: { type: Boolean, default: false },
  rootNewValue: { type: String, default: '' },
  selectedPaths: { type: Object, default: () => new Set() },
  totalTreeHeight: { type: Number, default: 0 },
  virtualOffset: { type: Number, default: 0 },
  virtualRows: { type: Array, default: () => [] },
  visibleRowCount: { type: Number, default: 0 },
})

const { t } = useI18n()
const treeContainer = ref(null)
const renameInput = ref(null)

onMounted(() => {
  emit('tree-container-ready', treeContainer.value)
})

onBeforeUnmount(() => {
  emit('tree-container-ready', null)
})

defineExpose({
  selectRootRenameInput() {
    renameInput.value?.select?.()
  },
})
</script>

<style scoped>
.file-tree-body {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
}

.file-tree-scroll {
  min-height: 0;
  flex: 1 1 auto;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 4px 4px 4px;
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0,
    black 18px,
    black calc(100% - 18px),
    transparent 100%
  );
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    black 18px,
    black calc(100% - 18px),
    transparent 100%
  );
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
}

.file-tree-root-rename-row {
  padding-left: 28px;
}

.file-tree-rename-input {
  border-color: color-mix(in srgb, var(--border) 48%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-base) 84%, transparent);
  font-size: var(--sidebar-font-control);
}

.file-tree-drop-indicator {
  border-color: var(--accent);
  color: var(--accent);
  opacity: 0.6;
}

.file-tree-empty-state {
  color: var(--text-muted);
}
</style>
