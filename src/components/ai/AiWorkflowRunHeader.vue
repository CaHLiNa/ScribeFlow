<template>
  <div
    v-if="header"
    class="ai-workflow-run-header"
    :class="[`surface-${surface}`, { 'is-compact': compact }]"
  >
    <div class="ai-workflow-run-header-top">
      <div class="ai-workflow-run-header-copy">
        <div class="ai-workflow-run-header-kicker">{{ t('Workflow') }}</div>
        <div class="ai-workflow-run-header-title">{{ header.title }}</div>
      </div>

      <span class="ai-workflow-run-header-status" :class="`tone-${statusTone}`">
        {{ statusLabel }}
      </span>
    </div>

    <div class="ai-workflow-run-header-meta">
      <span class="ai-workflow-run-header-pill">{{ header.templateLabel }}</span>
      <span class="ai-workflow-run-header-pill">
        {{ t('Current step') }} · {{ header.currentStepLabel || t('Waiting to start') }}
      </span>
      <span class="ai-workflow-run-header-pill">
        {{ t('{count} artifacts', { count: header.artifactCount }) }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../../i18n'
import { describeWorkflowHeader } from './workflowUi.js'

const props = defineProps({
  workflow: { type: Object, default: null },
  surface: { type: String, default: 'pane' },
  compact: { type: Boolean, default: false },
})

const { t } = useI18n()

const STATUS_LABELS = {
  draft: 'Draft',
  planned: 'Planned',
  running: 'Running',
  waiting_user: 'Waiting for approval',
  completed: 'Completed',
  failed: 'Failed',
}

const header = computed(() => describeWorkflowHeader(props.workflow))

const statusLabel = computed(() => (
  t(STATUS_LABELS[header.value?.status] || 'Workflow')
))

const statusTone = computed(() => {
  switch (header.value?.status) {
    case 'completed':
      return 'success'
    case 'failed':
      return 'danger'
    case 'waiting_user':
      return 'warning'
    case 'running':
      return 'accent'
    default:
      return 'muted'
  }
})
</script>

<style scoped>
.ai-workflow-run-header {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-secondary) 82%, var(--bg-primary));
  padding: 12px 14px;
}

.ai-workflow-run-header.surface-workbench {
  border-radius: 14px;
}

.ai-workflow-run-header-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.ai-workflow-run-header-copy {
  min-width: 0;
}

.ai-workflow-run-header-kicker {
  font-size: var(--surface-font-kicker, var(--ui-font-micro));
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.ai-workflow-run-header-title {
  margin-top: 6px;
  font-size: var(--surface-font-body, var(--ui-font-size));
  line-height: 1.35;
  font-weight: 600;
  color: var(--fg-primary);
}

.ai-workflow-run-header-status,
.ai-workflow-run-header-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-size: var(--ui-font-caption);
  line-height: 1.2;
}

.ai-workflow-run-header-status {
  flex-shrink: 0;
  color: var(--fg-secondary);
  background: var(--bg-primary);
}

.ai-workflow-run-header-status.tone-accent {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-primary));
}

.ai-workflow-run-header-status.tone-warning {
  color: var(--warning);
  border-color: color-mix(in srgb, var(--warning) 32%, var(--border));
  background: color-mix(in srgb, var(--warning) 8%, var(--bg-primary));
}

.ai-workflow-run-header-status.tone-success {
  color: var(--success, #4ade80);
  border-color: color-mix(in srgb, var(--success, #4ade80) 28%, var(--border));
  background: color-mix(in srgb, var(--success, #4ade80) 8%, var(--bg-primary));
}

.ai-workflow-run-header-status.tone-danger {
  color: var(--error);
  border-color: color-mix(in srgb, var(--error) 28%, var(--border));
  background: color-mix(in srgb, var(--error) 8%, var(--bg-primary));
}

.ai-workflow-run-header-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.ai-workflow-run-header-pill {
  color: var(--fg-secondary);
  background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
}

.ai-workflow-run-header.is-compact {
  padding: 11px 12px;
}

.ai-workflow-run-header.is-compact .ai-workflow-run-header-top {
  flex-direction: column;
  align-items: stretch;
}

.ai-workflow-run-header.is-compact .ai-workflow-run-header-status {
  align-self: flex-start;
}
</style>
