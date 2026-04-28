<template>
  <section class="document-problems-panel" :aria-label="t('Problems')">
    <div class="document-problems-panel__summary">
      <div class="document-problems-panel__summary-item" :class="{ 'has-items': errorCount > 0 }">
        <IconCircleX :size="14" :stroke-width="1.9" />
        <span>{{ errorCount }}</span>
      </div>
      <div class="document-problems-panel__summary-item" :class="{ 'has-items': warningCount > 0 }">
        <IconAlertTriangle :size="14" :stroke-width="1.9" />
        <span>{{ warningCount }}</span>
      </div>
    </div>

    <div v-if="problems.length === 0" class="document-problems-panel__empty">
      <IconCircleCheck :size="18" :stroke-width="1.8" />
      <span>{{ t('No problems') }}</span>
    </div>

    <div v-else class="document-problems-panel__list scrollbar-hidden" role="list">
      <button
        v-for="problem in problems"
        :key="problem.id"
        type="button"
        class="document-problems-panel__item"
        :class="`is-${problem.severity}`"
        role="listitem"
        @click="handleProblemClick(problem)"
      >
        <span class="document-problems-panel__severity" aria-hidden="true">
          <IconCircleX
            v-if="problem.severity === 'error'"
            :size="14"
            :stroke-width="1.9"
          />
          <IconAlertTriangle
            v-else-if="problem.severity === 'warning'"
            :size="14"
            :stroke-width="1.9"
          />
          <IconInfoCircle v-else :size="14" :stroke-width="1.9" />
        </span>
        <span class="document-problems-panel__content">
          <span class="document-problems-panel__message">{{ problem.message }}</span>
          <span class="document-problems-panel__meta">
            <span>{{ problem.origin }}</span>
            <span v-if="formatLocation(problem)">{{ formatLocation(problem) }}</span>
          </span>
        </span>
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconInfoCircle,
} from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useEditorStore } from '../../stores/editor'

const props = defineProps({
  filePath: { type: String, required: true },
})

const { t } = useI18n()
const editorStore = useEditorStore()
const workflowStore = useDocumentWorkflowStore()

const problems = computed(() =>
  workflowStore.getProblemsForFile(props.filePath, { t })
    .map((problem, index) => ({
      ...problem,
      id: problem.id || `${problem.sourcePath || props.filePath}:${index}`,
      message: String(problem.message || t('Unknown problem')).trim(),
      origin: String(problem.origin || t('Diagnostics')).trim(),
      severity: normalizeSeverity(problem.severity),
      sourcePath: String(problem.sourcePath || props.filePath),
    }))
)
const errorCount = computed(() => problems.value.filter((problem) => problem.severity === 'error').length)
const warningCount = computed(() =>
  problems.value.filter((problem) => problem.severity === 'warning').length
)

function normalizeSeverity(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'error' || normalized === 'warning') return normalized
  return 'info'
}

function formatLocation(problem = {}) {
  const line = Number(problem.line)
  const column = Number(problem.column)
  if (!Number.isFinite(line) || line <= 0) return ''
  if (!Number.isFinite(column) || column <= 0) return `${t('Line')} ${line}`
  return `${t('Line')} ${line}:${column}`
}

function handleProblemClick(problem = {}) {
  const sourcePath = String(problem.sourcePath || '').trim()
  if (sourcePath && sourcePath !== props.filePath) {
    editorStore.openFile(sourcePath)
  }
  workflowStore.focusProblem(problem)
}
</script>

<style scoped>
.document-problems-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  color: var(--text-primary);
  font-family: var(--font-ui);
}

.document-problems-panel__summary {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  min-height: 28px;
  padding: 2px 2px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 42%, transparent);
}

.document-problems-panel__summary-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.document-problems-panel__summary-item.has-items {
  color: var(--text-primary);
}

.document-problems-panel__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 auto;
  gap: 7px;
  color: var(--text-muted);
  font-size: 13px;
}

.document-problems-panel__list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 3px;
  min-height: 0;
  padding: 8px 0 2px;
  overflow-y: auto;
}

.document-problems-panel__item {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 7px;
  width: 100%;
  min-width: 0;
  padding: 7px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.document-problems-panel__item:hover,
.document-problems-panel__item:focus-visible {
  background: color-mix(in srgb, var(--surface-hover) 42%, transparent);
  outline: none;
}

.document-problems-panel__severity {
  display: inline-flex;
  justify-content: center;
  padding-top: 2px;
  color: var(--text-muted);
}

.document-problems-panel__item.is-error .document-problems-panel__severity {
  color: var(--error);
}

.document-problems-panel__item.is-warning .document-problems-panel__severity {
  color: var(--warning);
}

.document-problems-panel__content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.document-problems-panel__message {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12.5px;
  line-height: 1.35;
  text-overflow: ellipsis;
}

.document-problems-panel__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--text-muted);
  font-size: 11.5px;
  line-height: 1.2;
}
</style>
