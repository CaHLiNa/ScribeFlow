<template>
  <div class="extension-task-panel">
    <div v-if="timeline.running.length === 0 && timeline.recent.length === 0" class="extension-task-empty">
      {{ t('No extension tasks yet') }}
    </div>

    <section
      v-for="group in taskGroups"
      :key="group.id"
      v-show="group.rows.length > 0"
      class="extension-task-group"
    >
      <div class="extension-task-group__title">{{ t(group.titleKey) }}</div>
      <div v-for="row in group.rows" :key="row.id" class="extension-task-row">
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
          <div v-if="row.presentation.progress.available" class="extension-task-progress">
            {{ taskProgressSummary(row.presentation.progress) }}
          </div>
          <div v-if="row.presentation.results.entries.length > 0" class="extension-task-results">
            <div class="extension-task-results__header">
              <div class="extension-task-results__title">{{ t('Results') }}</div>
              <div class="extension-task-results__summary">
                {{ resultSummaryLabel(row.presentation.results) }}
              </div>
            </div>
            <button
              v-for="entry in row.presentation.results.entries"
              :key="entry.id"
              type="button"
              class="extension-task-results__entry"
              :class="{ 'is-active': activeResultEntry(row)?.id === entry.id }"
              @click="selectResultEntry(row, entry)"
            >
              <span class="extension-task-results__entry-label">{{ t(entry.label) }}</span>
              <span v-if="entry.description" class="extension-task-results__entry-description">
                {{ t(entry.description) }}
              </span>
            </button>
          </div>
          <ExtensionResultPreview
            v-if="activeResultEntry(row)"
            :entry="activeResultEntry(row)"
            :busy-action-key="resultActionBusyKey"
            @run-action="openResultEntry"
          />
        </div>
        <div class="extension-task-actions">
          <UiButton
            v-if="row.task.state === 'running' || row.task.state === 'queued'"
            variant="secondary"
            size="sm"
            @click="extensionsStore.cancelTask(row.task.id)"
          >
            {{ t('Cancel') }}
          </UiButton>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n, formatRelativeFromNow } from '../../i18n'
import { useExtensionsStore } from '../../stores/extensions'
import UiButton from '../shared/ui/UiButton.vue'
import ExtensionResultPreview from './ExtensionResultPreview.vue'
import ExtensionStatusPill from './ExtensionStatusPill.vue'
import ExtensionSummaryCard from './ExtensionSummaryCard.vue'
import { buildExtensionTaskPresentation } from '../../domains/extensions/extensionTaskPresentation.js'

const { t } = useI18n()
const extensionsStore = useExtensionsStore()
const resultActionBusyKey = ref('')
const activeResultEntryIds = ref({})
const props = defineProps({
  extensionId: { type: String, default: '' },
})
const timeline = computed(() => extensionsStore.taskTimelineForExtension(props.extensionId))

function buildTaskRow(task = {}) {
  return {
    id: String(task.id || ''),
    task,
    presentation: buildExtensionTaskPresentation(task),
  }
}

const taskGroups = computed(() => [
  { id: 'running', titleKey: 'Running', rows: timeline.value.running.map(buildTaskRow) },
  { id: 'recent', titleKey: 'Recent Extension Tasks', rows: timeline.value.recent.map(buildTaskRow) },
])

function activeResultEntry(row = {}) {
  const entries = row?.presentation?.results?.entries || []
  if (entries.length === 0) return null
  const selectedId = activeResultEntryIds.value[String(row.id || '')]
  return entries.find((entry) => entry.id === selectedId) || entries[0] || null
}

function selectResultEntry(row = {}, entry = {}) {
  const taskId = String(row.id || '')
  if (!taskId) return
  activeResultEntryIds.value = {
    ...activeResultEntryIds.value,
    [taskId]: String(entry?.id || ''),
  }
}

function resultActionKey(entry = {}) {
  return [
    String(entry?.id || '').trim(),
    String(entry?.action || '').trim().toLowerCase(),
    String(entry?.path || '').trim(),
  ].join('::')
}

async function openResultEntry(entry = {}) {
  const busyKey = resultActionKey(entry)
  resultActionBusyKey.value = busyKey
  try {
    await extensionsStore.runResultEntryAction(entry, {})
  } finally {
    if (resultActionBusyKey.value === busyKey) {
      resultActionBusyKey.value = ''
    }
  }
}

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
.extension-task-panel {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.extension-task-group {
  display: flex;
  flex-direction: column;
}

.extension-task-group__title {
  padding: 0 16px 8px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.extension-task-empty {
  padding: 14px 16px;
  color: var(--text-muted);
  font-size: 12px;
}

.extension-task-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
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

.extension-task-progress {
  font-size: 11px;
  color: var(--text-muted);
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
