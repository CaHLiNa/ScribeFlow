<template>
  <AiRuntimeStateCard
    :visible="tasks.length > 0"
    tone="warning"
    :title="t('Running tasks')"
    :items="taskItems"
    :max-visible-items="2"
    :max-detail-length="42"
  />
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../../i18n'
import AiRuntimeStateCard from './AiRuntimeStateCard.vue'

const props = defineProps({
  tasks: { type: Array, default: () => [] },
})

const { t } = useI18n()
const taskItems = computed(() =>
  (Array.isArray(props.tasks) ? props.tasks : []).map((task) => ({
    key: task.id,
    label: task.label,
    detail: taskMeta(task),
  }))
)

function taskMeta(task = {}) {
  const parts = []
  const detail = String(task.detail || '').trim()
  const lastToolName = String(task.lastToolName || '').trim()
  const elapsedSeconds = Number(task.elapsedSeconds || 0)

  if (detail) {
    parts.push(detail)
  } else if (lastToolName) {
    parts.push(lastToolName)
  }

  if (elapsedSeconds > 0) {
    parts.push(t('{count}s', { count: elapsedSeconds }))
  }

  return parts.join(' · ')
}
</script>
