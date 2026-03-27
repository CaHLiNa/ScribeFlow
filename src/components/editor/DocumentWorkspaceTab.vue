<template>
  <div class="document-workspace-tab">
    <div class="document-workspace-tab-source">
      <slot name="source" />
    </div>
    <div v-if="previewVisible" class="document-workspace-tab-preview">
      <slot name="preview" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  previewVisible: { type: Boolean, default: false },
})
</script>

<style scoped>
.document-workspace-tab {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--bg-primary);
}

.document-workspace-tab-source,
.document-workspace-tab-preview {
  min-width: 0;
  min-height: 0;
}

.document-workspace-tab-source {
  flex: 1 1 0;
}

.document-workspace-tab-preview {
  flex: 1 1 0;
  border-left: 1px solid var(--border);
}
</style>
