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
      <div class="extension-task-group__title" :class="group.presentation.toneClass">
        <span>{{ t(group.presentation.titleKey) }}</span>
        <span class="extension-task-group__count">
          {{ t(group.presentation.countLabelKey, group.presentation.countParams) }}
        </span>
      </div>
      <ExtensionTaskRow
        v-for="row in group.rows"
        :key="row.id"
        :active-entry="activeResultEntry(row)"
        :details-expanded="taskDetailsExpanded(row)"
        :quick-action-busy-key="resultActionBusyKey"
        :quick-action-key="quickActionBusyKey"
        :result-action-busy-key="resultActionBusyKey"
        :row="row"
        @open-result-entry="openResultEntry"
        @run-quick-action="runQuickAction"
        @select-result-entry="selectResultEntry"
        @toggle-details="toggleTaskDetails"
      />
      <ExtensionTaskHistoryFooter
        v-if="group.footer?.canToggle"
        :footer="group.footer"
        @toggle="toggleRecentHistory"
      />
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from '../../i18n'
import { useExtensionsStore } from '../../stores/extensions'
import ExtensionTaskHistoryFooter from './ExtensionTaskHistoryFooter.vue'
import ExtensionTaskRow from './ExtensionTaskRow.vue'
import {
  buildExtensionTaskPresentation,
  taskGroupPresentation,
  taskTimelinePresentation,
} from '../../domains/extensions/extensionTaskPresentation.js'

const { t } = useI18n()
const extensionsStore = useExtensionsStore()
const resultActionBusyKey = ref('')
const activeResultEntryIds = ref({})
const taskDetailExpansionOverrides = ref({})
const recentHistoryExpanded = ref(false)
const props = defineProps({
  extensionId: { type: String, default: '' },
})
const timeline = computed(() =>
  extensionsStore.taskTimelineForExtension(props.extensionId, undefined, {
    recentLimit: recentHistoryExpanded.value ? Number.MAX_SAFE_INTEGER : undefined,
  })
)
const timelinePresentation = computed(() => taskTimelinePresentation(timeline.value))

function buildTaskRow(task = {}) {
  return {
    id: String(task.id || ''),
    task,
    presentation: buildExtensionTaskPresentation(task),
  }
}

const taskGroups = computed(() => [
  buildTaskGroup('running', 'Running', timeline.value.running),
  buildTaskGroup('recent', 'Recent Extension Tasks', timeline.value.recent),
])

function buildTaskGroup(id = '', titleKey = '', tasks = []) {
  return {
    id,
    presentation: taskGroupPresentation({ id, titleKey, tasks }),
    footer: id === 'recent' ? timelinePresentation.value.recent : null,
    rows: tasks.map(buildTaskRow),
  }
}

function activeResultEntry(row = {}) {
  if (!taskDetailsExpanded(row)) return null
  const entries = row?.presentation?.results?.entries || []
  if (entries.length === 0) return null
  const selectedId = activeResultEntryIds.value[String(row.id || '')]
  return entries.find((entry) => entry.id === selectedId) || entries[0] || null
}

function taskDetailsExpanded(row = {}) {
  const taskId = String(row.id || '')
  if (!row?.presentation?.details?.available) return false
  if (!row.presentation.details.collapsible) return true
  if (taskId && taskDetailExpansionOverrides.value[taskId] != null) {
    return Boolean(taskDetailExpansionOverrides.value[taskId])
  }
  return Boolean(row.presentation.details.defaultExpanded)
}

function toggleTaskDetails(row = {}) {
  const taskId = String(row.id || '')
  if (!taskId || !row?.presentation?.details?.collapsible) return
  taskDetailExpansionOverrides.value = {
    ...taskDetailExpansionOverrides.value,
    [taskId]: !taskDetailsExpanded(row),
  }
}

function toggleRecentHistory() {
  recentHistoryExpanded.value = !recentHistoryExpanded.value
}

watch(
  () => props.extensionId,
  () => {
    recentHistoryExpanded.value = false
  },
)

function selectResultEntry(row = {}, entry = {}) {
  const taskId = String(row.id || '')
  if (!taskId) return
  if (row?.presentation?.details?.collapsible && !taskDetailsExpanded(row)) {
    taskDetailExpansionOverrides.value = {
      ...taskDetailExpansionOverrides.value,
      [taskId]: true,
    }
  }
  activeResultEntryIds.value = {
    ...activeResultEntryIds.value,
    [taskId]: String(entry?.id || ''),
  }
}

function resultEntryById(row = {}, entryId = '') {
  const id = String(entryId || '')
  if (!id) return null
  return (row?.presentation?.results?.entries || []).find((entry) => String(entry?.id || '') === id) || null
}

function resultActionKey(entry = {}) {
  return [
    String(entry?.id || '').trim(),
    String(entry?.action || '').trim().toLowerCase(),
    String(entry?.path || '').trim(),
  ].join('::')
}

function quickActionBusyKey(row = {}, action = {}) {
  if (action?.kind === 'cancel') {
    return ['task-action', row.id, action.id].join('::')
  }
  const entry = resultEntryById(row, action?.entryId)
  return entry ? resultActionKey(entry) : ''
}

async function runQuickAction(row = {}, action = {}) {
  if (action?.kind === 'cancel') {
    const busyKey = quickActionBusyKey(row, action)
    resultActionBusyKey.value = busyKey
    try {
      await extensionsStore.cancelTask(row.task.id)
    } finally {
      if (resultActionBusyKey.value === busyKey) {
        resultActionBusyKey.value = ''
      }
    }
    return
  }

  const entry = resultEntryById(row, action?.entryId)
  if (!entry) return
  if (action?.kind === 'select-entry') {
    if (row?.presentation?.details?.collapsible && !taskDetailsExpanded(row)) {
      toggleTaskDetails(row)
    }
    selectResultEntry(row, entry)
    return
  }
  if (action?.kind === 'run-entry') {
    await openResultEntry(entry)
  }
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
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 16px 8px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.extension-task-group__title.is-warning {
  color: var(--warning);
}

.extension-task-group__title.is-error {
  color: var(--error);
}

.extension-task-group__count {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  text-transform: none;
}

.extension-task-group__title.is-warning .extension-task-group__count {
  color: color-mix(in srgb, var(--warning) 72%, var(--text-muted));
}

.extension-task-group__title.is-error .extension-task-group__count {
  color: color-mix(in srgb, var(--error) 72%, var(--text-muted));
}

.extension-task-empty {
  padding: 14px 16px;
  color: var(--text-muted);
  font-size: 12px;
}
</style>
