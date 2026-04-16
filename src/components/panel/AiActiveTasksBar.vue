<template>
  <div v-if="tasks.length > 0" class="ai-active-tasks">
    <span class="ai-active-tasks__label">{{ t('Running tasks') }}</span>
    <div class="ai-active-tasks__list">
      <div
        v-for="task in tasks"
        :key="task.id"
        class="ai-active-tasks__item"
      >
        <span class="ai-active-tasks__item-label">{{ task.label }}</span>
        <span
          v-if="taskMeta(task)"
          class="ai-active-tasks__item-meta"
        >
          {{ taskMeta(task) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from '../../i18n'

defineProps({
  tasks: { type: Array, default: () => [] },
})

const { t } = useI18n()

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
    parts.push(t('Running for about {count}s.', { count: elapsedSeconds }))
  }

  return parts.join(' · ')
}
</script>

<style scoped>
.ai-active-tasks {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel-muted) 24%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-color) 34%, transparent);
}

.ai-active-tasks__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ai-active-tasks__list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ai-active-tasks__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--warning) 14%, transparent);
  color: var(--text-primary);
  font-size: 11px;
}

.ai-active-tasks__item-label {
  font-weight: 600;
}

.ai-active-tasks__item-meta {
  color: var(--text-secondary);
}
</style>
