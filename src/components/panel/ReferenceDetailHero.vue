<template>
  <div class="inspector-section inspector-section--hero">
    <div class="inspector-section-header">
      <span class="inspector-type-label">{{ typeLabel }}</span>
      <button
        type="button"
        class="inspector-icon-btn inspector-icon-btn--save"
        :class="{ 'has-changes': hasDraftChanges }"
        :disabled="!hasDraftChanges"
        :title="t('Save')"
        @click="$emit('save')"
      >
        <IconDeviceFloppy :size="16" :stroke-width="1.6" />
      </button>
    </div>

    <div class="inspector-hero-content">
      <UiTextarea
        :model-value="title"
        variant="ghost"
        :rows="2"
        shell-class="inspector-input-title"
        :placeholder="t('Title')"
        @update:model-value="(value) => $emit('update-title', value)"
        @focus="$emit('focus-title')"
        @blur="$emit('blur-title')"
      />
      <div v-if="metaItems.length > 0" class="inspector-hero-meta">
        <span v-for="item in metaItems" :key="item" class="inspector-hero-meta-item">
          {{ item }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconDeviceFloppy } from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import UiTextarea from '../shared/ui/UiTextarea.vue'

defineEmits(['blur-title', 'focus-title', 'save', 'update-title'])

defineProps({
  hasDraftChanges: { type: Boolean, default: false },
  metaItems: { type: Array, default: () => [] },
  title: { type: String, default: '' },
  typeLabel: { type: String, default: '' },
})

const { t } = useI18n()
</script>

<style scoped>
.inspector-section--hero {
  gap: 7px !important;
  padding: 2px 0 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 42%, transparent);
}

.inspector-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  user-select: none;
}

.inspector-type-label {
  color: var(--text-secondary);
}

.inspector-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.inspector-icon-btn:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.inspector-icon-btn--save.has-changes {
  background: var(--button-primary-bg);
  color: var(--button-primary-text);
}

.inspector-icon-btn--save.has-changes:hover:not(:disabled) {
  background: var(--button-primary-bg-hover);
  color: var(--button-primary-text);
}

.inspector-icon-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.inspector-hero-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

:deep(.ui-textarea-shell--ghost) {
  padding-inline: 0 !important;
  margin-inline: 0;
}

:deep(.ui-textarea-shell--ghost:focus-within) {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 68%, transparent);
}

:deep(.ui-textarea-control) {
  resize: none;
}

:deep(.inspector-input-title .ui-textarea-control) {
  font-family: var(--font-ui);
  font-size: 16px;
  font-weight: 650;
  line-height: 1.32;
  letter-spacing: 0;
  color: var(--text-primary);
  min-height: 42px;
  padding-block: 2px;
}

.inspector-hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-width: 0;
}

.inspector-hero-meta-item {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-width: 0;
  height: 20px;
  padding: 0 7px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--surface-hover) 36%, transparent);
  color: var(--text-muted);
  font-size: 11.5px;
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
