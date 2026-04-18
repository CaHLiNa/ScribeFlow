<template>
  <div v-if="tasks.length > 0" class="ai-task-progress">
    <div class="ai-task-progress__header">
      <span class="ai-task-progress__title">{{ t('Task progress') }}</span>
      <span class="ai-task-progress__count">{{ completedCount }}/{{ tasks.length }}</span>
    </div>

    <div class="ai-task-progress__list">
      <div
        v-for="task in tasks"
        :key="task.id"
        class="ai-task-progress__item"
        :class="`is-${task.status}`"
      >
        <span class="ai-task-progress__dot"></span>
        <span class="ai-task-progress__label">{{ task.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../../i18n'

const props = defineProps({
  tasks: { type: Array, default: () => [] },
})

const { t } = useI18n()
const completedCount = computed(() =>
  props.tasks.filter((task) => task.status === 'done').length
)
</script>

<style scoped>
.ai-task-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 7px 9px;
  border-radius: 10px;
  border: 1px dashed color-mix(in srgb, var(--border-color) 28%, transparent);
  background: color-mix(in srgb, var(--panel-muted) 10%, transparent);
}

.ai-task-progress__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ai-task-progress__title,
.ai-task-progress__count {
  font-size: 10px;
  color: var(--text-tertiary);
}

.ai-task-progress__title {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ai-task-progress__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-task-progress__item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.ai-task-progress__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--text-tertiary);
}

.ai-task-progress__item.is-done .ai-task-progress__dot {
  background: var(--success);
}

.ai-task-progress__item.is-running .ai-task-progress__dot {
  background: var(--warning);
}

.ai-task-progress__item.is-error .ai-task-progress__dot {
  background: var(--error);
}
</style>
