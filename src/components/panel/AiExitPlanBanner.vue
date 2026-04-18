<template>
  <div v-if="request" class="ai-inline-banner ai-inline-banner--exit-plan">
    <div class="ai-inline-banner__copy">
      <div class="ai-inline-banner__title">{{ t('Plan approval required') }}</div>
      <div class="ai-inline-banner__body">
        {{ t('The agent finished planning and is waiting for your decision before leaving plan mode.') }}
      </div>
    </div>

    <div
      v-if="allowedPrompts.length > 0"
      class="ai-inline-banner__allowed"
    >
      <div class="ai-inline-banner__allowed-label">{{ t('Allowed follow-up prompts') }}</div>
      <div class="ai-inline-banner__allowed-list">
        <div
          v-for="(entry, index) in allowedPrompts"
          :key="`${entry.tool}:${index}`"
          class="ai-inline-banner__allowed-item"
        >
          <span class="ai-inline-banner__allowed-tool">{{ entry.tool }}</span>
          <span class="ai-inline-banner__allowed-prompt">{{ entry.prompt }}</span>
        </div>
      </div>
    </div>

    <UiTextarea
      :model-value="feedback"
      :rows="2"
      class="ai-inline-banner__textarea"
      :placeholder="t('Optional feedback for the plan')"
      @update:model-value="feedback = String($event || '')"
    />

    <div class="ai-inline-banner__actions">
      <UiButton
        variant="ghost"
        size="sm"
        :disabled="submitting"
        @click="submit('deny')"
      >
        {{ t('Deny') }}
      </UiButton>
      <UiButton
        variant="secondary"
        size="sm"
        :disabled="submitting"
        @click="submit('approve_edit')"
      >
        {{ t('Approve with approvals') }}
      </UiButton>
      <UiButton
        variant="secondary"
        size="sm"
        :disabled="submitting || !feedback.trim()"
        @click="submit('feedback')"
      >
        {{ t('Request changes') }}
      </UiButton>
      <UiButton
        variant="primary"
        size="sm"
        :disabled="submitting"
        @click="submit('approve_auto')"
      >
        {{ t('Approve and auto-run') }}
      </UiButton>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import UiTextarea from '../shared/ui/UiTextarea.vue'

const props = defineProps({
  request: { type: Object, default: null },
  submitting: { type: Boolean, default: false },
})

const emit = defineEmits(['submit'])

const { t } = useI18n()
const feedback = ref('')

const allowedPrompts = computed(() =>
  Array.isArray(props.request?.allowedPrompts) ? props.request.allowedPrompts : []
)

watch(
  () => props.request?.requestId,
  () => {
    feedback.value = ''
  },
  { immediate: true }
)

function submit(action = 'deny') {
  if (!props.request?.requestId) return
  emit('submit', {
    requestId: props.request.requestId,
    action,
    feedback: String(feedback.value || '').trim(),
  })
}
</script>

<style scoped>
.ai-inline-banner {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
}

.ai-inline-banner--exit-plan {
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border-color) 72%);
  background: color-mix(in srgb, var(--accent) 9%, transparent);
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

.ai-inline-banner__allowed {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-inline-banner__allowed-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ai-inline-banner__allowed-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-inline-banner__allowed-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-base) 58%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-color) 34%, transparent);
}

.ai-inline-banner__allowed-tool {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
}

.ai-inline-banner__allowed-prompt {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
  white-space: pre-wrap;
}

.ai-inline-banner__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
