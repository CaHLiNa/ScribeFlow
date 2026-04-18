<template>
  <AiBlockingBannerShell
    v-if="request"
    tone="warning"
    :title="request.title || t('Permission request')"
    :body="request.description || request.decisionReason"
  >
    <template v-if="contextItems.length > 0" #copy>
      <AiRuntimeContextSummary :items="contextItems" />
    </template>

    <div v-if="request.inputPreview" class="ai-permission-banner__preview">
      {{ request.inputPreview }}
    </div>

    <template #actions>
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
    </template>
  </AiBlockingBannerShell>
</template>

<script setup>
import { useI18n } from '../../i18n'
import AiBlockingBannerShell from './AiBlockingBannerShell.vue'
import AiRuntimeContextSummary from './AiRuntimeContextSummary.vue'
import UiButton from '../shared/ui/UiButton.vue'

defineProps({
  request: { type: Object, default: null },
  contextItems: { type: Array, default: () => [] },
  submitting: { type: Boolean, default: false },
})

defineEmits(['deny', 'allow-once', 'allow-always'])

const { t } = useI18n()
</script>

<style scoped>
.ai-permission-banner__preview {
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

</style>
