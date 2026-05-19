<template>
  <div class="inspector-section">
    <div class="inspector-section-header">
      <span>{{ t('Content') }}</span>
    </div>

    <details class="inspector-details">
      <summary class="inspector-details-summary">
        <IconChevronRight :size="14" class="disclosure-icon" /> {{ t('Abstract') }}
      </summary>
      <div class="inspector-details-body">
        <UiTextarea
          :model-value="abstract"
          variant="ghost"
          :rows="5"
          @update:model-value="(value) => $emit('update-abstract', value)"
          @focus="$emit('focus-abstract')"
          @blur="$emit('blur-abstract')"
        />
      </div>
    </details>

    <details class="inspector-details">
      <summary class="inspector-details-summary">
        <IconChevronRight :size="14" class="disclosure-icon" /> {{ t('Notes') }}
      </summary>
      <div class="inspector-details-body">
        <UiTextarea
          :model-value="note"
          variant="ghost"
          :rows="4"
          @update:model-value="(value) => $emit('update-note', value)"
          @focus="$emit('focus-note')"
          @blur="$emit('blur-note')"
        />
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { IconChevronRight } from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import UiTextarea from '../shared/ui/UiTextarea.vue'

defineEmits([
  'blur-abstract',
  'blur-note',
  'focus-abstract',
  'focus-note',
  'update-abstract',
  'update-note',
])

defineProps({
  abstract: { type: String, default: '' },
  note: { type: String, default: '' },
})

const { t } = useI18n()
</script>

<style scoped>
.inspector-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.inspector-details {
  margin-bottom: 4px;
}

.inspector-details-summary {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  list-style: none;
}

.inspector-details-summary::-webkit-details-marker {
  display: none;
}

.disclosure-icon {
  color: var(--text-muted);
  transition: transform 0.2s ease;
}

details[open] .disclosure-icon {
  transform: rotate(90deg);
}

.inspector-details-body {
  padding-top: 6px;
  padding-left: 18px;
}

.inspector-details-body :deep(.ui-textarea-control) {
  min-height: 84px;
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
</style>
