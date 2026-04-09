<template>
  <DocumentWorkspaceTab v-if="useWorkspace" :preview-visible="previewVisible">
    <template #source>
      <slot name="source">
        <EditorTextWorkspaceSurface
          ref="textSurfaceRef"
          :filePath="filePath"
          :paneId="paneId"
          @cursor-change="(pos) => $emit('cursor-change', pos)"
          @editor-stats="(stats) => $emit('editor-stats', stats)"
          @selection-change="(selection) => $emit('selection-change', selection)"
        />
      </slot>
    </template>
    <template #preview>
      <slot name="preview" />
    </template>
  </DocumentWorkspaceTab>
  <EditorTextWorkspaceSurface
    v-else
    ref="textSurfaceRef"
    :filePath="filePath"
    :paneId="paneId"
    @cursor-change="(pos) => $emit('cursor-change', pos)"
    @editor-stats="(stats) => $emit('editor-stats', stats)"
    @selection-change="(selection) => $emit('selection-change', selection)"
  />
</template>

<script setup>
import { defineAsyncComponent, ref } from 'vue'

const DocumentWorkspaceTab = defineAsyncComponent(() => import('./DocumentWorkspaceTab.vue'))
const EditorTextWorkspaceSurface = defineAsyncComponent(() => import('./EditorTextWorkspaceSurface.vue'))

defineProps({
  useWorkspace: { type: Boolean, default: false },
  previewVisible: { type: Boolean, default: false },
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
})

defineEmits(['cursor-change', 'editor-stats', 'selection-change'])

const textSurfaceRef = ref(null)

defineExpose({
  getBoundingClientRect() {
    return textSurfaceRef.value?.getBoundingClientRect?.() || null
  },
})
</script>
