<template>
  <div class="extension-task-group__footer">
    <span>
      {{ t(footer.expanded ? footer.expandedLabelKey : footer.hiddenLabelKey, footer.expanded ? footer.expandedParams : footer.hiddenParams) }}
    </span>
    <button
      type="button"
      class="extension-task-history-toggle"
      :aria-expanded="footer.expanded ? 'true' : 'false'"
      @click="$emit('toggle')"
    >
      {{ t(footer.expanded ? footer.collapseLabelKey : footer.showAllLabelKey) }}
    </button>
  </div>
</template>

<script setup>
import { useI18n } from '../../i18n'

defineEmits(['toggle'])

defineProps({
  footer: { type: Object, required: true },
})

const { t } = useI18n()
</script>

<style scoped>
.extension-task-group__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 16px 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.4;
}

.extension-task-group__footer > span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.extension-task-history-toggle {
  flex: 0 0 auto;
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

.extension-task-history-toggle:hover {
  color: var(--text-primary);
}

.extension-task-history-toggle:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 70%, transparent);
  outline-offset: 2px;
  border-radius: 4px;
}
</style>
