<template>
  <div v-if="request" class="ai-inline-banner ai-inline-banner--ask">
    <div class="ai-inline-banner__copy">
      <div class="ai-inline-banner__title">{{ request.title || t('Question from the agent') }}</div>
      <div class="ai-inline-banner__body">{{ request.prompt || request.description || t('The current runtime is waiting for user input.') }}</div>
    </div>

    <div v-if="questions.length > 0" class="ai-inline-banner__questions">
      <div
        v-for="(question, index) in questions"
        :key="question.id || index"
        class="ai-inline-banner__question"
      >
        <div class="ai-inline-banner__question-header">
          {{ question.header || `${t('Question')} ${index + 1}` }}
        </div>
        <div class="ai-inline-banner__question-body">{{ question.question }}</div>

        <div
          v-if="question.options?.length > 0"
          class="ai-inline-banner__options"
        >
          <button
            v-for="option in question.options"
            :key="option.label"
            type="button"
            class="ai-inline-banner__option"
            :class="{ 'is-active': isSelected(index, option.label) }"
            @click="toggleOption(index, question, option.label)"
          >
            <span>{{ option.label }}</span>
            <span v-if="option.description" class="ai-inline-banner__option-description">{{ option.description }}</span>
          </button>
        </div>

        <UiTextarea
          :model-value="freeTextAnswers[index] || ''"
          :rows="2"
          class="ai-inline-banner__textarea"
          :placeholder="t('Optional answer')"
          @update:model-value="setFreeText(index, $event)"
        />
      </div>
    </div>

    <UiTextarea
      v-else
      :model-value="fallbackAnswer"
      :rows="3"
      class="ai-inline-banner__textarea"
      :placeholder="t('Type your answer')"
      @update:model-value="fallbackAnswer = String($event || '')"
    />

    <div class="ai-inline-banner__actions">
      <UiButton
        variant="primary"
        size="sm"
        :disabled="submitting || !canSubmit"
        @click="submitAnswers"
      >
        {{ submitting ? t('Submitting...') : t('Submit response') }}
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
const selectedOptions = ref({})
const freeTextAnswers = ref({})
const fallbackAnswer = ref('')

const questions = computed(() =>
  Array.isArray(props.request?.questions) ? props.request.questions : []
)

function resetAnswers() {
  selectedOptions.value = {}
  freeTextAnswers.value = {}
  fallbackAnswer.value = ''
}

watch(
  () => props.request?.requestId,
  () => {
    resetAnswers()
  },
  { immediate: true }
)

function isSelected(index = 0, label = '') {
  const selected = selectedOptions.value[index] || []
  return selected.includes(label)
}

function toggleOption(index = 0, question = {}, label = '') {
  const selected = [...(selectedOptions.value[index] || [])]
  const nextSelected = question.multiSelect
    ? (selected.includes(label) ? selected.filter((entry) => entry !== label) : [...selected, label])
    : [label]

  selectedOptions.value = {
    ...selectedOptions.value,
    [index]: nextSelected,
  }
}

function setFreeText(index = 0, value = '') {
  freeTextAnswers.value = {
    ...freeTextAnswers.value,
    [index]: String(value || ''),
  }
}

const canSubmit = computed(() => {
  if (questions.value.length === 0) {
    return String(fallbackAnswer.value || '').trim().length > 0
  }

  return questions.value.some((_, index) => {
    const selected = selectedOptions.value[index] || []
    const freeText = String(freeTextAnswers.value[index] || '').trim()
    return selected.length > 0 || freeText.length > 0
  })
})

function submitAnswers() {
  if (!props.request?.requestId || !canSubmit.value) return

  if (questions.value.length === 0) {
    emit('submit', {
      requestId: props.request.requestId,
      answers: {
        response: String(fallbackAnswer.value || '').trim(),
      },
    })
    return
  }

  const answers = Object.fromEntries(
    questions.value.map((question, index) => {
      const selected = selectedOptions.value[index] || []
      const freeText = String(freeTextAnswers.value[index] || '').trim()
      const value = freeText || selected.join(', ')
      return [question.id || `question-${index + 1}`, value]
    }).filter(([, value]) => String(value || '').trim().length > 0)
  )

  emit('submit', {
    requestId: props.request.requestId,
    answers,
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
  border: 1px solid color-mix(in srgb, var(--info) 24%, var(--border-color) 76%);
  background: color-mix(in srgb, var(--info) 8%, transparent);
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

.ai-inline-banner__questions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-inline-banner__question {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-base) 58%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-color) 34%, transparent);
}

.ai-inline-banner__question-header {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ai-inline-banner__question-body {
  font-size: 12px;
  color: var(--text-primary);
  line-height: 1.5;
}

.ai-inline-banner__options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-inline-banner__option {
  appearance: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--border-color) 38%, transparent);
  background: color-mix(in srgb, var(--panel-muted) 18%, transparent);
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
}

.ai-inline-banner__option.is-active {
  border-color: color-mix(in srgb, var(--accent) 30%, var(--border-color) 70%);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--text-primary);
}

.ai-inline-banner__option-description {
  font-size: 11px;
  color: var(--text-tertiary);
}

.ai-inline-banner__textarea {
  padding: 0 !important;
}

.ai-inline-banner__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
