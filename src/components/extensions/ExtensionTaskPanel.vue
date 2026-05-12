<template>
  <div class="extension-task-panel">
    <div v-if="timeline.running.length === 0 && timeline.recent.length === 0" class="extension-task-empty">
      {{ t('No extension tasks yet') }}
    </div>

    <section v-if="timeline.running.length > 0" class="extension-task-group">
      <div class="extension-task-group__title">{{ t('Running') }}</div>
      <div v-for="task in timeline.running" :key="task.id" class="extension-task-row">
        <div class="extension-task-main">
          <div class="extension-task-title">
            <span>{{ taskTitle(task) }}</span>
            <span class="extension-task-state" :class="`is-${task.state}`">{{ taskStateLabel(task) }}</span>
          </div>
          <div class="extension-task-meta">
            {{ taskMeta(task) }}
          </div>
          <div class="extension-task-time">{{ taskTimeSummary(task) }}</div>
          <div v-if="taskProgressSummary(task)" class="extension-task-progress">
            {{ taskProgressSummary(task) }}
          </div>
          <div v-if="taskResultEntries(task).length > 0" class="extension-task-results">
            <div class="extension-task-results__title">{{ t('Results') }}</div>
            <button
              v-for="entry in taskResultEntries(task)"
              :key="entry.id"
              type="button"
              class="extension-task-results__entry"
              :class="{ 'is-active': activeResultEntry(task)?.id === entry.id }"
              @click="selectResultEntry(task, entry)"
            >
              <span class="extension-task-results__entry-label">{{ t(entry.label) }}</span>
              <span v-if="entry.description" class="extension-task-results__entry-description">
                {{ t(entry.description) }}
              </span>
            </button>
          </div>
          <ExtensionResultPreview
            v-if="activeResultEntry(task)"
            :entry="activeResultEntry(task)"
            :busy-action-key="resultActionBusyKey"
            @run-action="openResultEntry"
          />
        </div>
        <div class="extension-task-actions">
          <UiButton
            v-if="task.state === 'running' || task.state === 'queued'"
            variant="secondary"
            size="sm"
            @click="extensionsStore.cancelTask(task.id)"
          >
            {{ t('Cancel') }}
          </UiButton>
        </div>
      </div>
    </section>

    <section v-if="timeline.recent.length > 0" class="extension-task-group">
      <div class="extension-task-group__title">{{ t('Recent Extension Tasks') }}</div>
      <div v-for="task in timeline.recent" :key="task.id" class="extension-task-row">
        <div class="extension-task-main">
          <div class="extension-task-title">
            <span>{{ taskTitle(task) }}</span>
            <span class="extension-task-state" :class="`is-${task.state}`">{{ taskStateLabel(task) }}</span>
          </div>
          <div class="extension-task-meta">
            {{ taskMeta(task) }}
          </div>
          <div class="extension-task-time">{{ taskTimeSummary(task) }}</div>
          <div v-if="taskProgressSummary(task)" class="extension-task-progress">
            {{ taskProgressSummary(task) }}
          </div>
          <div v-if="taskResultEntries(task).length > 0" class="extension-task-results">
            <div class="extension-task-results__title">{{ t('Results') }}</div>
            <button
              v-for="entry in taskResultEntries(task)"
              :key="entry.id"
              type="button"
              class="extension-task-results__entry"
              :class="{ 'is-active': activeResultEntry(task)?.id === entry.id }"
              @click="selectResultEntry(task, entry)"
            >
              <span class="extension-task-results__entry-label">{{ t(entry.label) }}</span>
              <span v-if="entry.description" class="extension-task-results__entry-description">
                {{ t(entry.description) }}
              </span>
            </button>
          </div>
          <ExtensionResultPreview
            v-if="activeResultEntry(task)"
            :entry="activeResultEntry(task)"
            :busy-action-key="resultActionBusyKey"
            @run-action="openResultEntry"
          />
        </div>
        <div class="extension-task-actions">
          <UiButton
            v-if="task.state === 'running' || task.state === 'queued'"
            variant="secondary"
            size="sm"
            @click="extensionsStore.cancelTask(task.id)"
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
import {
  buildExtensionTaskResultEntries,
  titleCaseKey,
} from '../../domains/extensions/extensionResultEntries'
import { buildExtensionTargetSummary } from '../../domains/extensions/extensionTargetPresentation.js'

const { t } = useI18n()
const extensionsStore = useExtensionsStore()
const resultActionBusyKey = ref('')
const activeResultEntryIds = ref({})
const props = defineProps({
  extensionId: { type: String, default: '' },
})
const timeline = computed(() => extensionsStore.taskTimelineForExtension(props.extensionId))

function taskEntries(task = {}) {
  return buildExtensionTaskResultEntries(task)
}

function activeResultEntry(task = {}) {
  const entries = taskEntries(task)
  if (entries.length === 0) return null
  const selectedId = activeResultEntryIds.value[String(task.id || '')]
  return entries.find((entry) => entry.id === selectedId) || entries[0] || null
}

function taskResultEntries(task = {}) {
  return taskEntries(task)
}

function selectResultEntry(task = {}, entry = {}) {
  const taskId = String(task.id || '')
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

function taskTitle(task = {}) {
  const explicit = String(task.commandId || task.capability || '').trim()
  if (!explicit) return t('Extension task')
  if (explicit === 'retainPdf.refreshView') return t('RetainPDF')
  const normalized = titleCaseKey(explicit)
  return t(normalized)
}

function canonicalTaskStatusKey(value = '') {
  switch (String(value || '').trim().toLowerCase()) {
    case 'queued':
      return 'Queued'
    case 'running':
      return 'Running'
    case 'succeeded':
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'cancelled':
    case 'canceled':
      return 'Cancelled'
    default:
      return ''
  }
}

function renderTaskStatusLabel(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const canonical = canonicalTaskStatusKey(raw)
  return canonical ? t(canonical) : t(raw)
}

function taskStateLabel(task = {}) {
  return renderTaskStatusLabel(task?.progress?.label || task?.state) || t('Completed')
}

function taskTargetLabel(task = {}) {
  const presentation = buildExtensionTargetSummary(task?.target || {})
  if (presentation.available) {
    return t(presentation.textKey, presentation.params)
  }
  return String(presentation.kind || '').trim()
}

function taskMeta(task = {}) {
  const parts = []
  const targetLabel = taskTargetLabel(task)
  if (targetLabel) parts.push(targetLabel)
  return parts.filter(Boolean).join(' · ')
}

function taskProgressSummary(task = {}) {
  const label = renderTaskStatusLabel(task?.progress?.label)
  const current = Number(task?.progress?.current || 0)
  const total = Number(task?.progress?.total || 0)
  if (total > 0) {
    return `${label || t('Progress')}: ${current}/${total}`
  }
  return label && label !== taskStateLabel(task) ? label : ''
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
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.extension-task-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary);
}

.extension-task-state {
  font-size: 11px;
  color: var(--text-muted);
}

.extension-task-state.is-succeeded {
  color: var(--success);
}

.extension-task-state.is-failed {
  color: var(--error);
}

.extension-task-meta {
  font-size: 12px;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
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

.extension-task-results__title {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.extension-task-results__entry {
  display: flex;
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
}

.extension-task-results__entry.is-active {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface-raised));
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
</style>
