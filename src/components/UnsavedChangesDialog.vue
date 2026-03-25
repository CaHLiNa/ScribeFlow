<template>
  <UiModalShell
    :visible="store.visible"
    size="sm"
    surface-class="unsaved-dialog"
    @close="store.resolve('cancel')"
  >
    <div class="unsaved-title">{{ store.title }}</div>
    <div v-if="store.message" class="unsaved-message">{{ store.message }}</div>
    <div v-if="store.details.length > 0" class="unsaved-list">
      <div
        v-for="detail in store.details"
        :key="detail"
        class="unsaved-list-item"
      >
        {{ detail }}
      </div>
    </div>
    <div class="unsaved-actions">
      <UiButton variant="secondary" @click="store.resolve('cancel')">
        {{ store.cancelLabel || t('Cancel') }}
      </UiButton>
      <UiButton variant="danger" @click="store.resolve('discard')">
        {{ store.discardLabel || t("Don't Save") }}
      </UiButton>
      <UiButton variant="primary" @click="store.resolve('save')">
        {{ store.saveLabel || t('Save') }}
      </UiButton>
    </div>
  </UiModalShell>
</template>

<script setup>
import { useUnsavedChangesStore } from '../stores/unsavedChanges'
import { useI18n } from '../i18n'
import UiButton from './shared/ui/UiButton.vue'
import UiModalShell from './shared/ui/UiModalShell.vue'

const store = useUnsavedChangesStore()
const { t } = useI18n()
</script>

<style scoped>
.unsaved-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.unsaved-title {
  color: var(--text-primary);
  font-size: var(--ui-font-body);
  font-weight: var(--font-weight-semibold);
}

.unsaved-message {
  color: var(--text-muted);
  font-size: var(--ui-font-body);
  line-height: var(--line-height-regular);
}

.unsaved-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
  padding: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-base) 92%, transparent);
}

.unsaved-list-item {
  color: var(--text-secondary);
  font-size: var(--ui-font-body);
  line-height: var(--line-height-compact);
  word-break: break-word;
}

.unsaved-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
</style>
