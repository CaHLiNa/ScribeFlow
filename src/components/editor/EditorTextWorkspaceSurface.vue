<template>
  <div ref="containerRef" class="editor-pane-text-surface">
    <KeepAlive :max="TEXT_EDITOR_CACHE_MAX">
      <component
        :is="TextEditor"
        :key="`text:${filePath}`"
        class="flex-1 min-w-0 h-full"
        :filePath="filePath"
        :paneId="paneId"
        @cursor-change="(pos) => $emit('cursor-change', pos)"
        @editor-stats="(stats) => $emit('editor-stats', stats)"
        @selection-change="(selection) => $emit('selection-change', selection)"
      />
    </KeepAlive>
  </div>
</template>

<script setup>
import { defineAsyncComponent, ref } from 'vue'

const TextEditor = defineAsyncComponent(() => import('./TextEditor.vue'))

defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
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
</style>
