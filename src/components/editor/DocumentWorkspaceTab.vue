<template>
  <div ref="containerRef" class="document-workspace-tab">
    <div class="document-workspace-tab-source" :style="sourceStyle">
      <slot name="source" />
    </div>
    <div v-if="previewVisible" class="document-workspace-tab-resize-slot">
      <ResizeHandle
        class="document-workspace-tab-resize-handle"
        direction="vertical"
        @resize="handleResize"
      />
    </div>
    <div v-if="previewVisible" class="document-workspace-tab-preview" :style="previewStyle">
      <slot name="preview" />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import ResizeHandle from '../layout/ResizeHandle.vue'

const props = defineProps({
  previewVisible: { type: Boolean, default: false },
})

const containerRef = ref(null)
const previewRatio = ref(0.46)

const sourceStyle = computed(() => {
  if (!props.previewVisible) {
    return {
      flex: '1 1 auto',
      width: '100%',
    }
  }
  return {
    width: `${(1 - previewRatio.value) * 100}%`,
  }
})

const previewStyle = computed(() => {
  if (!props.previewVisible) return {}
  return {
    width: `${previewRatio.value * 100}%`,
  }
})

function handleResize(event) {
  if (!props.previewVisible) return
  const container = containerRef.value
  if (!container) return

  const rect = container.getBoundingClientRect()
  if (!rect.width) return

  const nextPreviewRatio = (rect.right - event.x) / rect.width
  previewRatio.value = Math.max(0.24, Math.min(0.76, nextPreviewRatio))
}
</script>

/* START OF FILE src/components/editor/DocumentWorkspaceTab.vue (只替换 style 部分) */
<style scoped>
.document-workspace-tab {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: transparent;
}

.document-workspace-tab-source,
.document-workspace-tab-preview {
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
}

.document-workspace-tab-source {
  flex: 0 0 auto;
  background: var(--shell-editor-surface);
  overflow: hidden;
}

.document-workspace-tab-preview {
  flex: 0 0 auto;
  background: var(--shell-preview-surface);
  border-left: 1px solid var(--workbench-divider-soft);
  overflow: hidden;
}

.document-workspace-tab-resize-slot {
  position: relative;
  z-index: 5;
  flex: 0 0 auto;
  width: 0;
  overflow: visible;
}

.document-workspace-tab-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  width: 8px;
  height: 100%;
}
</style>
