<template>
  <div
    v-if="checkpoint"
    class="ai-workflow-checkpoint-card"
    :class="[`surface-${surface}`, { 'is-compact': compact }]"
  >
    <div class="ai-workflow-checkpoint-card-top">
      <div class="ai-workflow-checkpoint-card-copy">
        <div class="ai-workflow-checkpoint-card-kicker">{{ t('Approval required') }}</div>
        <div class="ai-workflow-checkpoint-card-title">{{ checkpointTitle }}</div>
        <div class="ai-workflow-checkpoint-card-body">
          {{ checkpointMeta }}
        </div>
      </div>

      <span class="ai-workflow-checkpoint-card-pill">{{ checkpointTypeLabel }}</span>
    </div>

    <div class="ai-workflow-checkpoint-card-actions">
      <button
        class="ai-workflow-checkpoint-btn is-primary"
        type="button"
        :disabled="isSubmitting"
        @click="handleDecision('accept')"
      >
        {{ t('Accept') }}
      </button>
      <button
        class="ai-workflow-checkpoint-btn"
        type="button"
        :disabled="isSubmitting"
        @click="handleDecision('skip')"
      >
        {{ t('Skip') }}
      </button>
      <button
        class="ai-workflow-checkpoint-btn"
        type="button"
        :disabled="isSubmitting"
        @click="handleDecision('continue_later')"
      >
        {{ t('Continue later') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from '../../i18n'
import { useAiWorkflowRunsStore } from '../../stores/aiWorkflowRuns'
import { describeWorkflowHeader } from './workflowUi.js'

const props = defineProps({
  workflow: { type: Object, default: null },
  checkpoint: { type: Object, default: null },
  sessionId: { type: String, default: '' },
  surface: { type: String, default: 'pane' },
  compact: { type: Boolean, default: false },
})

const { t } = useI18n()
const aiWorkflowRuns = useAiWorkflowRunsStore()
const submittingAction = ref('')

const CHECKPOINT_TYPE_LABELS = {
  apply_patch: 'Patch approval',
  accept_sources: 'Sources approval',
  checkpoint: 'Checkpoint',
}

const header = computed(() => describeWorkflowHeader(props.workflow))
const isSubmitting = computed(() => !!submittingAction.value)

const checkpointTitle = computed(() => (
  props.checkpoint?.label
  || header.value?.currentStepLabel
  || t('Review workflow decision')
))

const checkpointMeta = computed(() => {
  const parts = []
  if (header.value?.title) parts.push(header.value.title)
  if (header.value?.currentStepLabel) parts.push(`${t('Current step')}: ${header.value.currentStepLabel}`)
  return parts.join(' · ') || t('This workflow is paused until you choose how to continue.')
})

const checkpointTypeLabel = computed(() => (
  t(CHECKPOINT_TYPE_LABELS[props.checkpoint?.type] || 'Checkpoint')
))

async function handleDecision(action) {
  if (!props.checkpoint?.id || submittingAction.value) return

  submittingAction.value = action
  try {
    let workflow = props.sessionId ? aiWorkflowRuns.getRunForSession(props.sessionId) : null
    if (!workflow && props.workflow?.run?.id) {
      workflow = aiWorkflowRuns.getRun(props.workflow.run.id)
    }
    if (!workflow && props.sessionId && props.workflow) {
      workflow = aiWorkflowRuns.restoreSessionWorkflow(props.sessionId, props.workflow)
    }

    const runId = workflow?.run?.id || props.workflow?.run?.id
    if (!runId) return

    aiWorkflowRuns.applyCheckpointDecision({
      runId,
      checkpointId: props.checkpoint.id,
      decision: { action },
      resolvedBy: 'user',
    })
  } finally {
    submittingAction.value = ''
  }
}
</script>

<style scoped>
.ai-workflow-checkpoint-card {
  border: 1px solid color-mix(in srgb, var(--warning) 30%, var(--border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--warning) 7%, var(--bg-primary));
  padding: 12px 14px;
}

.ai-workflow-checkpoint-card.surface-workbench {
  border-radius: 14px;
}

.ai-workflow-checkpoint-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.ai-workflow-checkpoint-card-copy {
  min-width: 0;
}

.ai-workflow-checkpoint-card-kicker {
  font-size: var(--surface-font-kicker, var(--ui-font-micro));
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--warning);
}

.ai-workflow-checkpoint-card-title {
  margin-top: 6px;
  font-size: var(--surface-font-body, var(--ui-font-size));
  line-height: 1.35;
  font-weight: 600;
  color: var(--fg-primary);
}

.ai-workflow-checkpoint-card-body {
  margin-top: 6px;
  font-size: calc(var(--ui-font-size) - 1px);
  line-height: 1.5;
  color: var(--fg-secondary);
}

.ai-workflow-checkpoint-card-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--warning) 34%, var(--border));
  background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
  color: var(--warning);
  font-size: var(--ui-font-caption);
  line-height: 1.2;
  flex-shrink: 0;
}

.ai-workflow-checkpoint-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.ai-workflow-checkpoint-btn {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--fg-secondary);
  cursor: pointer;
  transition: border-color 0.14s ease, background-color 0.14s ease, color 0.14s ease;
}

.ai-workflow-checkpoint-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
  color: var(--fg-primary);
}

.ai-workflow-checkpoint-btn.is-primary {
  border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-primary));
  color: var(--accent);
}

.ai-workflow-checkpoint-btn:disabled {
  opacity: 0.65;
  cursor: default;
}

.ai-workflow-checkpoint-card.is-compact {
  padding: 11px 12px;
}

.ai-workflow-checkpoint-card.is-compact .ai-workflow-checkpoint-card-top {
  flex-direction: column;
  align-items: stretch;
}

.ai-workflow-checkpoint-card.is-compact .ai-workflow-checkpoint-card-pill {
  align-self: flex-start;
}
</style>
