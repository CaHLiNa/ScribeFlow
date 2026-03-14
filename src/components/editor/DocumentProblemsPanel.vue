<template>
  <div v-if="problems.length > 0" class="workflow-problems-panel">
    <div class="workflow-problems-main">
      <div class="workflow-problems-copy">
        <span class="workflow-problems-pill" :class="{ 'workflow-problems-pill-warning': primaryProblem.severity === 'warning' }">
          {{ primaryLabel }}
        </span>
        <span class="workflow-problems-message">{{ primaryProblem.message }}</span>
      </div>
      <div class="workflow-problems-actions">
        <button
          v-if="problems.length > 1"
          class="workflow-problems-btn"
          @click="$emit('toggle')"
        >
          {{ expanded ? t('Hide problems') : t('Show problems') }}
        </button>
        <button
          v-if="canViewLog"
          class="workflow-problems-btn workflow-problems-btn-accent"
          @click="$emit('view-log')"
        >
          {{ t('View log') }}
        </button>
      </div>
    </div>

    <div v-if="expanded && problems.length > 1" class="workflow-problems-list">
      <button
        v-for="problem in problems"
        :key="problem.id"
        class="workflow-problem-item"
        :class="{ 'workflow-problem-item-warning': problem.severity === 'warning' }"
        @click="$emit('focus-problem', problem)"
      >
        <span class="workflow-problem-line">{{ problemLabel(problem) }}</span>
        <span class="workflow-problem-item-message">{{ problem.message }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../../i18n'

const props = defineProps({
  problems: { type: Array, default: () => [] },
  expanded: { type: Boolean, default: false },
  canViewLog: { type: Boolean, default: false },
})

defineEmits(['toggle', 'focus-problem', 'view-log'])

const { t } = useI18n()

const primaryProblem = computed(() => props.problems[0] || null)
const primaryLabel = computed(() => problemLabel(primaryProblem.value))

function problemLabel(problem) {
  if (!problem) return ''
  if (problem.line) return t('Ln {line}', { line: problem.line })
  return t('No line info')
}
</script>

<style scoped>
.workflow-problems-panel {
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-secondary) 84%, transparent);
}

.workflow-problems-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px 12px;
}

.workflow-problems-copy {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.workflow-problems-pill {
  flex: none;
  padding: 2px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--error) 14%, transparent);
  color: var(--error);
  font-size: var(--ui-font-caption);
  font-weight: 600;
}

.workflow-problems-pill-warning {
  background: color-mix(in srgb, var(--warning) 16%, transparent);
  color: var(--warning);
}

.workflow-problems-message,
.workflow-problem-item-message {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fg-primary);
  font-size: var(--ui-font-label);
}

.workflow-problems-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.workflow-problems-btn {
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--fg-muted);
  font-size: var(--ui-font-caption);
}

.workflow-problems-btn:hover {
  background: var(--bg-hover);
  color: var(--fg-primary);
}

.workflow-problems-btn-accent {
  color: var(--accent);
}

.workflow-problems-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px 8px;
}

.workflow-problem-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  padding: 7px 8px;
  border-radius: 8px;
  background: transparent;
  text-align: left;
}

.workflow-problem-item:hover {
  background: var(--bg-hover);
}

.workflow-problem-line {
  flex: none;
  color: var(--fg-muted);
  font-size: var(--ui-font-caption);
}

.workflow-problem-item-warning .workflow-problem-line {
  color: var(--warning);
}
</style>
