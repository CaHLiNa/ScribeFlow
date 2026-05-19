<template>
  <div class="workbench-rail-center">
    <div class="workbench-rail-title-target">
      <div
        v-show="railTitleState.showDocumentTitleSlot"
        :id="documentTitleTargetId"
        class="workbench-rail-title-slot"
      ></div>
      <div
        v-if="railTitleState.showInlineDocumentTitle"
        class="workbench-rail-document-title"
        :title="railTitleState.documentTitleLabel"
        :aria-label="railTitleState.documentTitleLabel"
      >
        <span class="workbench-rail-document-title-label">{{ railTitleState.documentTitleLabel }}</span>
      </div>
      <div
        v-if="railTitleState.showContextTitle"
        class="workbench-rail-context-title"
        :title="railTitleState.contextTitleLabel"
        :aria-label="railTitleState.contextTitleLabel"
      >
        <span class="workbench-rail-context-title-label">{{ railTitleState.contextTitleLabel }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps({
  documentTitleTargetId: { type: String, default: 'app-shell-topbar-document-title' },
  railTitleState: {
    type: Object,
    default: () => ({
      contextTitleLabel: '',
      documentTitleLabel: '',
      showContextTitle: false,
      showDocumentTitleSlot: true,
      showInlineDocumentTitle: false,
    }),
  },
})
</script>

<style scoped>
.workbench-rail-center {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
  pointer-events: auto;
}

.workbench-rail-title-target {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 24px;
  min-width: 0;
  max-width: min(440px, 100%);
  overflow: visible;
  pointer-events: auto;
}

.workbench-rail-title-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
}

.workbench-rail-document-title,
.workbench-rail-context-title {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  min-width: 0;
  min-height: 26px;
  padding: 0 8px;
  border-radius: 8px;
  background: transparent;
  box-shadow: none;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.25;
  user-select: none;
  -webkit-user-select: none;
}

.workbench-rail-document-title-label,
.workbench-rail-context-title-label {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

</style>
