<template>
  <header class="reference-workbench__toolbar">
    <div class="reference-workbench__toolbar-group">
      <UiButton
        variant="secondary"
        size="sm"
        shell-class="workbench-action-btn"
        @click="$emit('add')"
      >
        <template #leading><IconPlus :size="14" :stroke-width="2" /></template>
        {{ t('Add') }}
      </UiButton>
      <div class="workbench-toolbar-divider"></div>
      <UiButton
        variant="ghost"
        size="sm"
        shell-class="workbench-action-btn"
        :loading="importInFlight"
        :disabled="isLoading"
        @click="$emit('import-pdf')"
      >
        <template #leading><IconFileTypePdf :size="14" :stroke-width="1.8" /></template>
        {{ t('PDF') }}
      </UiButton>
      <UiButton
        variant="ghost"
        size="sm"
        shell-class="workbench-action-btn"
        :loading="importInFlight"
        :disabled="isLoading"
        @click="$emit('import-bibtex')"
      >
        <template #leading><IconFileCode :size="14" :stroke-width="1.8" /></template>
        {{ t('BibTeX') }}
      </UiButton>
    </div>

    <div class="reference-workbench__toolbar-group">
      <UiButton
        variant="ghost"
        size="sm"
        shell-class="workbench-action-btn"
        :disabled="!canExport"
        @click="$emit('export-bibtex')"
      >
        <template #leading><IconShare :size="14" :stroke-width="1.8" /></template>
        {{ t('Export') }}
      </UiButton>
    </div>
  </header>
</template>

<script setup lang="ts">
import { IconFileCode, IconFileTypePdf, IconPlus, IconShare } from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'

defineEmits(['add', 'export-bibtex', 'import-bibtex', 'import-pdf'])

defineProps({
  canExport: { type: Boolean, default: false },
  importInFlight: { type: Boolean, default: false },
  isLoading: { type: Boolean, default: false },
})

const { t } = useI18n()
</script>

<style scoped>
.reference-workbench__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 auto;
  gap: 12px;
  height: 31px;
  min-height: 31px;
  padding: 0 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--workbench-divider-soft) 72%, transparent);
  background: transparent;
  overflow: hidden;
}

.reference-workbench__toolbar-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.workbench-toolbar-divider {
  width: 1px;
  height: 14px;
  background: color-mix(in srgb, var(--border) 40%, transparent);
  margin: 0 4px;
}

:deep(.workbench-action-btn) {
  min-height: 24px;
  height: 24px;
  padding: 0 8px;
  font-size: 12px;
  border-radius: 5px;
  color: var(--text-secondary);
}

:deep(.workbench-action-btn .ui-button-leading svg) {
  opacity: 0.8;
}

:deep(.workbench-action-btn.ui-button--secondary) {
  background: color-mix(in srgb, var(--surface-hover) 36%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 30%, transparent);
  box-shadow: none;
}

:deep(.workbench-action-btn.ui-button--ghost:hover) {
  background: var(--surface-hover);
  color: var(--text-primary);
}

@media (max-width: 920px) {
  .reference-workbench__toolbar {
    height: 31px;
    min-height: 31px;
    flex-wrap: nowrap;
    padding-top: 0;
    padding-bottom: 0;
  }
}
</style>
