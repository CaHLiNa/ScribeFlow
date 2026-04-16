<template>
  <div
    v-if="resumeState?.active"
    class="ai-inline-banner ai-inline-banner--resume"
  >
    <div class="ai-inline-banner__title">{{ t('Waiting to resume') }}</div>
    <div class="ai-inline-banner__body">
      {{ resumeState.message || t('The agent is collecting background task results before resuming.') }}
    </div>
  </div>
</template>

<script setup>
import { useI18n } from '../../i18n'

defineProps({
  resumeState: {
    type: Object,
    default: () => ({ active: false, message: '' }),
  },
})

const { t } = useI18n()
</script>

<style scoped>
.ai-inline-banner {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 14px;
}

.ai-inline-banner--resume {
  border: 1px solid color-mix(in srgb, var(--info) 24%, var(--border-color) 76%);
  background: color-mix(in srgb, var(--info) 9%, transparent);
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
