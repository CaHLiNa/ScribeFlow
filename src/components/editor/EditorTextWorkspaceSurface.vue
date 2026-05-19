<template>
  <div ref="containerRef" class="editor-pane-text-surface">
    <KeepAlive :max="TEXT_EDITOR_CACHE_MAX">
      <component
        :is="TextEditor"
        :key="`text:${filePath}`"
        :filePath="filePath"
        :paneId="paneId"
        :read-only="readOnly"
        @cursor-change="(pos) => $emit('cursor-change', pos)"
        @editor-stats="(stats) => $emit('editor-stats', stats)"
        @selection-change="(selection) => $emit('selection-change', selection)"
      />
    </KeepAlive>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'

const TextEditor = defineAsyncComponent(() => import('./TextEditor.vue'))

defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
  readOnly: { type: Boolean, default: false },
})

defineEmits(['cursor-change', 'editor-stats', 'selection-change'])

const TEXT_EDITOR_CACHE_MAX = 4
const containerRef = ref(null)

defineExpose({
  getBoundingClientRect() {
    return containerRef.value?.getBoundingClientRect?.() || null
  },
})
</script>

<style scoped>
.editor-pane-text-surface {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--shell-editor-surface);
}

.editor-pane-text-surface :deep(.text-editor-shell) {
  flex: 1 1 auto;
  min-width: 0;
}
</style>
