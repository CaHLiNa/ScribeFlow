<template>
  <div v-if="request" class="ai-inline-banner ai-inline-banner--permission">
    <div class="ai-inline-banner__copy">
      <div class="ai-inline-banner__title">
        {{ request.title || t('Permission request') }}
      </div>
      <div v-if="request.description || request.decisionReason" class="ai-inline-banner__body">
        {{ request.description || request.decisionReason }}
      </div>
    </div>

    <div v-if="request.inputPreview" class="ai-inline-banner__preview">
      {{ request.inputPreview }}
    </div>

    <div class="ai-inline-banner__actions">
      <UiButton
        variant="ghost"
        size="sm"
        :disabled="submitting"
        @click="$emit('deny', request)"
      >
        {{ t('Deny') }}
      </UiButton>
      <UiButton
        variant="secondary"
        size="sm"
        :disabled="submitting"
        @click="$emit('allow-once', request)"
      >
        {{ t('Allow once') }}
      </UiButton>
      <UiButton
        variant="primary"
        size="sm"
        :disabled="submitting"
        @click="$emit('allow-always', request)"
      >
        {{ t('Always allow') }}
      </UiButton>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'

defineProps({
  request: { type: Object, default: null },
  submitting: { type: Boolean, default: false },
})

defineEmits(['deny', 'allow-once', 'allow-always'])

const { t } = useI18n()
</script>

<style scoped>
.ai-inline-banner {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
}

.ai-inline-banner--permission {
  border: 1px solid color-mix(in srgb, var(--warning) 24%, var(--border-color) 76%);
  background: color-mix(in srgb, var(--warning) 7%, transparent);
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

.ai-inline-banner__preview {
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--border-color) 34%, transparent);
  background: color-mix(in srgb, var(--surface-base) 58%, transparent);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-tertiary);
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-inline-banner__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
