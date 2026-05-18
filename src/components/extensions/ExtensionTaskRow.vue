<template>
  <div
    class="extension-task-row"
    :class="row.presentation.row.toneClass"
  >
    <div class="extension-task-main">
      <div class="extension-task-title">
        <span>{{ t(row.presentation.titleKey) }}</span>
        <ExtensionStatusPill
          :label="t(row.presentation.status.labelKey)"
          :tone-class="row.presentation.status.toneClass"
        />
      </div>
      <div v-if="row.presentation.facts.length > 0" class="extension-task-facts">
        <ExtensionSummaryCard
          v-for="fact in row.presentation.facts"
          :key="fact.id"
          :title="t(fact.labelKey)"
          :value="t(fact.valueKey, fact.params)"
        />
      </div>
      <div class="extension-task-time">{{ taskTimeSummary(row.task) }}</div>
      <button
        v-if="row.presentation.details.collapsible"
        type="button"
        class="extension-task-detail-toggle"
        :aria-expanded="detailsExpanded ? 'true' : 'false'"
        @click="$emit('toggle-details', row)"
      >
        {{ t(detailsExpanded ? row.presentation.details.collapseLabelKey : row.presentation.details.expandLabelKey) }}
      </button>
      <div v-if="detailsExpanded" class="extension-task-details">
        <div
          v-if="row.presentation.progress.available"
          class="extension-task-progress"
          :class="row.presentation.progress.visual.toneClass"
        >
          <div class="extension-task-progress__row">
            <span>{{ taskProgressSummary(row.presentation.progress) }}</span>
            <span v-if="row.presentation.progress.visual.total > 0" class="extension-task-progress__count">
              {{ row.presentation.progress.visual.current }}/{{ row.presentation.progress.visual.total }}
            </span>
          </div>
          <div
            v-if="row.presentation.progress.visual.total > 0"
            class="extension-task-progress__track"
            role="progressbar"
            :aria-valuemin="0"
            :aria-valuemax="row.presentation.progress.visual.total"
            :aria-valuenow="row.presentation.progress.visual.current"
          >
            <span :style="{ width: row.presentation.progress.visual.width }"></span>
          </div>
        </div>
        <div v-if="row.presentation.results.entries.length > 0" class="extension-task-results">
          <div class="extension-task-results__header">
            <div class="extension-task-results__title">{{ t('Results') }}</div>
            <div class="extension-task-results__summary">
              {{ resultSummaryLabel(row.presentation.results) }}
            </div>
          </div>
          <div
            v-for="group in row.presentation.results.groups"
            :key="group.id"
            class="extension-task-results__group"
          >
            <div class="extension-task-results__group-title">
              <span>{{ t(group.titleKey) }}</span>
              <span>{{ group.count }}</span>
            </div>
            <button
              v-for="entry in group.entries"
              :key="entry.id"
              type="button"
              class="extension-task-results__entry"
              :class="{ 'is-active': activeEntry?.id === entry.id }"
              @click="$emit('select-result-entry', row, entry)"
            >
              <span class="extension-task-results__entry-label">{{ t(entry.label) }}</span>
              <span v-if="entry.description" class="extension-task-results__entry-description">
                {{ t(entry.description) }}
              </span>
            </button>
          </div>
        </div>
        <ExtensionResultPreview
          v-if="activeEntry"
          :entry="activeEntry"
          :busy-action-key="resultActionBusyKey"
          @run-action="$emit('open-result-entry', $event)"
        />
      </div>
    </div>
    <div v-if="row.presentation.quickActions.length > 0" class="extension-task-actions">
      <UiButton
        v-for="action in row.presentation.quickActions"
        :key="action.id"
        :variant="action.variant"
        size="sm"
        :loading="quickActionBusyKey === quickActionKey(row, action)"
        @click="$emit('run-quick-action', row, action)"
      >
        {{ t(action.labelKey) }}
      </UiButton>
    </div>
  </div>
</template>

<script setup>
import { useI18n, formatRelativeFromNow } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import ExtensionResultPreview from './ExtensionResultPreview.vue'
import ExtensionStatusPill from './ExtensionStatusPill.vue'
import ExtensionSummaryCard from './ExtensionSummaryCard.vue'

defineEmits([
  'open-result-entry',
  'run-quick-action',
  'select-result-entry',
  'toggle-details',
])

defineProps({
  activeEntry: { type: Object, default: null },
  detailsExpanded: { type: Boolean, default: false },
  quickActionBusyKey: { type: String, default: '' },
  quickActionKey: { type: Function, required: true },
  resultActionBusyKey: { type: String, default: '' },
  row: { type: Object, required: true },
})

const { t } = useI18n()

function taskProgressSummary(progress = {}) {
  return t(progress.valueKey, {
    ...progress.params,
    label: t(progress.labelKey),
  })
}

function resultSummaryLabel(results = {}) {
  const parts = []
  if (results.artifactCount > 0) {
    parts.push(t('{count} artifacts', { count: results.artifactCount }))
  }
  if (results.outputCount > 0) {
    parts.push(t('{count} outputs', { count: results.outputCount }))
  }
  if (results.actionCount > 0) {
    parts.push(t('{count} actions', { count: results.actionCount }))
  }
  return parts.join(' · ') || t('{count} entries', { count: results.entryCount || 0 })
}

function taskTimeSummary(task = {}) {
  const state = String(task?.state || '').trim().toLowerCase()
  if (state === 'running' || state === 'queued') {
    const startedAt = String(task.startedAt || task.createdAt || '').trim()
    const activeLabel = state === 'queued' ? t('Queued') : t('Running')
    return startedAt ? `${activeLabel} · ${formatRelativeFromNow(startedAt)}` : activeLabel
  }
  const finishedAt = String(task.finishedAt || task.startedAt || task.createdAt || '').trim()
  if (!finishedAt) return ''
  const terminalLabel = (() => {
    switch (state) {
      case 'failed':
        return t('Failed')
      case 'cancelled':
      case 'canceled':
        return t('Cancelled')
      default:
        return t('Completed')
    }
  })()
  return `${terminalLabel} · ${formatRelativeFromNow(finishedAt)}`
}
</script>

<style scoped>
.extension-task-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
}

.extension-task-row.is-warning {
  box-shadow: inset 2px 0 0 color-mix(in srgb, var(--warning) 70%, var(--border));
  background: color-mix(in srgb, var(--warning) 5%, transparent);
}

.extension-task-row.is-error {
  box-shadow: inset 2px 0 0 color-mix(in srgb, var(--error) 70%, var(--border));
  background: color-mix(in srgb, var(--error) 5%, transparent);
}

.extension-task-row:last-child {
  border-bottom: none;
}

.extension-task-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.extension-task-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary);
}

.extension-task-title > span:first-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

.extension-task-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
  gap: 6px;
}

.extension-task-detail-toggle {
  width: fit-content;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
}

.extension-task-detail-toggle:hover {
  color: var(--text-primary);
}

.extension-task-detail-toggle:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 70%, transparent);
  outline-offset: 2px;
  border-radius: 4px;
}

.extension-task-details {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
}

.extension-task-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--text-muted);
  font-size: 11px;
}

.extension-task-progress__row {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.extension-task-progress__count {
  flex: 0 0 auto;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.extension-task-progress__track {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-hover) 70%, transparent);
}

.extension-task-progress__track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width 160ms ease;
}

.extension-task-progress.is-success .extension-task-progress__track span {
  background: var(--success);
}

.extension-task-progress.is-error .extension-task-progress__track span {
  background: var(--error);
}

.extension-task-time {
  font-size: 11px;
  color: var(--text-muted);
}

.extension-task-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.extension-task-results__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.extension-task-results__title {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.extension-task-results__summary {
  min-width: 0;
  color: var(--text-muted);
  font-size: 11px;
  overflow-wrap: anywhere;
  text-align: right;
}

.extension-task-results__group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.extension-task-results__group-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.extension-task-results__entry {
  display: flex;
  width: 100%;
  min-height: 42px;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  border: 1px solid color-mix(in srgb, var(--border) 46%, transparent);
  border-radius: 8px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--surface-raised) 84%, transparent);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 120ms ease,
    background-color 120ms ease;
}

.extension-task-results__entry.is-active {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface-raised));
}

.extension-task-results__entry:hover {
  border-color: color-mix(in srgb, var(--accent) 32%, var(--border));
  background: color-mix(in srgb, var(--surface-hover) 70%, var(--surface-raised));
}

.extension-task-results__entry:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 70%, transparent);
  outline-offset: 2px;
}

.extension-task-results__entry-label {
  font-size: 12px;
  font-weight: 600;
}

.extension-task-results__entry-description {
  color: var(--text-secondary);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.extension-task-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

@container (max-width: 360px) {
  .extension-task-row {
    flex-direction: column;
  }

  .extension-task-actions {
    align-self: flex-end;
  }
}
</style>
