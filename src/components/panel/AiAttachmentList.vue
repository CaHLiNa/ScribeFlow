<template>
  <div v-if="attachments.length > 0" class="ai-attachment-list">
    <article
      v-for="attachment in attachments"
      :key="attachment.id"
      class="ai-attachment-list__item"
    >
      <div class="ai-attachment-list__copy">
        <div class="ai-attachment-list__title">{{ attachment.name }}</div>
        <div class="ai-attachment-list__meta">
          {{ attachment.relativePath || attachment.path }}
        </div>
      </div>
      <UiButton
        variant="ghost"
        size="sm"
        @click="$emit('remove', attachment.id)"
      >
        {{ t('Remove') }}
      </UiButton>
    </article>
  </div>
</template>

<script setup>
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'

defineProps({
  attachments: { type: Array, default: () => [] },
})

defineEmits(['remove'])

const { t } = useI18n()
</script>

<style scoped>
.ai-attachment-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-attachment-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--border-color) 40%, transparent);
  background: color-mix(in srgb, var(--panel-muted) 22%, transparent);
}

.ai-attachment-list__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ai-attachment-list__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.ai-attachment-list__meta {
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
