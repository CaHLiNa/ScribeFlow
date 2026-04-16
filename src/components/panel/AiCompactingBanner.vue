<template>
  <div
    v-if="compaction?.active"
    class="ai-inline-banner ai-inline-banner--compact"
  >
    <div class="ai-inline-banner__copy">
      <div class="ai-inline-banner__title">{{ t('Compacting context') }}</div>
      <div class="ai-inline-banner__body">
        {{ t('The runtime is compacting earlier context before continuing.') }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from '../../i18n'

defineProps({
  compaction: {
    type: Object,
    default: () => ({ active: false, lastCompletedAt: 0 }),
  },
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

.ai-inline-banner--compact {
  border: 1px solid color-mix(in srgb, var(--warning) 28%, var(--border-color) 72%);
  background: color-mix(in srgb, var(--warning) 10%, transparent);
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
</style>
