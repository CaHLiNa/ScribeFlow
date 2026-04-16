<template>
  <div
    v-if="planMode?.active"
    class="ai-inline-banner ai-inline-banner--plan"
  >
    <div class="ai-inline-banner__copy">
      <div class="ai-inline-banner__title">{{ t('Plan mode is active') }}</div>
      <div v-if="planMode.summary" class="ai-inline-banner__body">{{ planMode.summary }}</div>
      <div v-if="planMode.note" class="ai-inline-banner__body ai-inline-banner__body--muted">{{ planMode.note }}</div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from '../../i18n'

defineProps({
  planMode: { type: Object, default: () => ({ active: false, summary: '', note: '' }) },
})

const { t } = useI18n()
</script>

<style scoped>
.ai-inline-banner {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 14px;
}

.ai-inline-banner--plan {
  border: 1px dashed color-mix(in srgb, var(--accent) 28%, var(--border-color) 72%);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.ai-inline-banner__copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-inline-banner__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.ai-inline-banner__body {
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary);
  white-space: pre-wrap;
}

.ai-inline-banner__body--muted {
  color: var(--text-tertiary);
}
</style>
