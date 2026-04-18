<template>
  <details
    v-if="isExpandable"
    class="ai-tool-line"
    :class="`is-${part.status}`"
    :open="part.status === 'error'"
  >
    <summary class="ai-tool-line__summary">
      <span class="ai-tool-line__dot"></span>
      <span class="ai-tool-line__label">{{ part.label }}</span>
      <span v-if="part.context" class="ai-tool-line__context">{{ part.context }}</span>
      <span class="ai-tool-line__status">{{ statusLabel }}</span>
    </summary>
    <div class="ai-tool-line__detail">
      <div v-if="part.detail" class="ai-tool-line__detail-copy">{{ part.detail }}</div>
      <pre v-if="payloadText" class="ai-tool-line__payload">{{ payloadText }}</pre>
    </div>
  </details>

  <div
    v-else
    class="ai-tool-line"
    :class="`is-${part.status}`"
  >
    <div class="ai-tool-line__summary ai-tool-line__summary--static">
      <span class="ai-tool-line__dot"></span>
      <span class="ai-tool-line__label">{{ part.label }}</span>
      <span v-if="part.context" class="ai-tool-line__context">{{ part.context }}</span>
      <span class="ai-tool-line__status">{{ statusLabel }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../../i18n'

const props = defineProps({
  part: { type: Object, required: true },
})

const { t } = useI18n()

const isExpandable = computed(() => !!(props.part.detail || props.part.payload))
const payloadText = computed(() => {
  if (!props.part.payload) return ''
  try {
    return JSON.stringify(props.part.payload, null, 2)
  } catch {
    return ''
  }
})

const statusLabel = computed(() => {
  if (props.part.status === 'running') return t('Running')
  if (props.part.status === 'error') return t('Error')
  return t('Done')
})
</script>

<style scoped>
.ai-tool-line {
  background: transparent;
  border: none;
}

.ai-tool-line__summary {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 3px 0;
  list-style: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.76;
  transition: opacity 0.2s ease;
}
.ai-tool-line__summary:hover {
  opacity: 1;
}

.ai-tool-line__summary::-webkit-details-marker {
  display: none;
}

.ai-tool-line__summary--static {
  cursor: default;
}

.ai-tool-line__dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--text-tertiary);
}

.ai-tool-line__label {
  flex: 0 1 auto;
  font-weight: 600;
  color: color-mix(in srgb, var(--text-primary) 86%, var(--text-secondary) 14%);
}

.ai-tool-line__context {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--text-tertiary);
}

.ai-tool-line__status {
  flex: 0 0 auto;
  font-size: 10px;
  color: var(--text-tertiary);
}

.ai-tool-line__detail {
  display: grid;
  gap: 6px;
  padding: 0 0 8px 16px;
}

.ai-tool-line__detail-copy,
.ai-tool-line__payload {
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-tool-line__payload {
  margin: 0;
  padding: 7px 9px;
  border-radius: 8px;
  font-family: var(--font-mono);
  background: color-mix(in srgb, var(--surface-base) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-color) 68%, transparent);
}

.ai-tool-line.is-running .ai-tool-line__dot {
  background: var(--warning);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--warning) 14%, transparent);
  animation: ai-tool-line-pulse 1.4s ease-out infinite;
}

.ai-tool-line.is-done .ai-tool-line__dot {
  background: var(--success);
}

.ai-tool-line.is-error .ai-tool-line__dot {
  background: var(--error);
}

@keyframes ai-tool-line-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--warning) 24%, transparent);
  }

  100% {
    box-shadow: 0 0 0 8px color-mix(in srgb, var(--warning) 0%, transparent);
  }
}
</style>
