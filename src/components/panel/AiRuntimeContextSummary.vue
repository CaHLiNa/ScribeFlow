<template>
  <div v-if="items.length > 0" class="ai-runtime-context-summary">
    <div class="ai-runtime-context-summary__label">{{ t('Also active') }}</div>
    <div class="ai-runtime-context-summary__list">
      <div
        v-for="item in displayItems"
        :key="item.key || item.label"
        class="ai-runtime-context-summary__item"
        :class="`is-${item.tone || 'neutral'}`"
      >
        <span class="ai-runtime-context-summary__item-label">{{ item.label }}</span>
        <span v-if="item.detail" class="ai-runtime-context-summary__item-detail">{{ item.detail }}</span>
      </div>
      <button
        v-if="overflowCount > 0 && !expanded"
        type="button"
        class="ai-runtime-context-summary__item ai-runtime-context-summary__item--overflow ai-runtime-context-summary__toggle"
        @click="expanded = true"
      >
        <span class="ai-runtime-context-summary__item-label">{{ t('+{count} more', { count: overflowCount }) }}</span>
      </button>
      <button
        v-else-if="expanded && normalizedItems.length > collapsedItems.length"
        type="button"
        class="ai-runtime-context-summary__item ai-runtime-context-summary__item--overflow ai-runtime-context-summary__toggle"
        @click="expanded = false"
      >
        <span class="ai-runtime-context-summary__item-label">{{ t('Show less') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from '../../i18n'

const props = defineProps({
  items: { type: Array, default: () => [] },
  maxVisibleItems: { type: Number, default: 3 },
  maxDetailLength: { type: Number, default: 40 },
})

const { t } = useI18n()
const expanded = ref(false)
const normalizedItems = computed(() =>
  (Array.isArray(props.items) ? props.items : []).map((item) => ({
    ...item,
    detail: truncateText(item?.detail, props.maxDetailLength),
  }))
)
const collapsedItems = computed(() =>
  normalizedItems.value.slice(0, Math.max(0, Number(props.maxVisibleItems || 0)))
)
const displayItems = computed(() => (expanded.value ? normalizedItems.value : collapsedItems.value))
const overflowCount = computed(() =>
  Math.max(0, normalizedItems.value.length - collapsedItems.value.length)
)

watch(
  () => normalizedItems.value.length,
  () => {
    if (normalizedItems.value.length <= collapsedItems.value.length) {
      expanded.value = false
    }
  }
)

function truncateText(value = '', maxLength = 40) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ')
  if (!normalized) return ''
  const limit = Math.max(10, Number(maxLength || 40))
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit - 1).trimEnd()}…`
}
</script>

<style scoped>
.ai-runtime-context-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-runtime-context-summary__label {
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-tertiary);
}

.ai-runtime-context-summary__list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ai-runtime-context-summary__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--border-color) 24%, transparent);
  background: color-mix(in srgb, var(--surface-base) 58%, transparent);
}

.ai-runtime-context-summary__item--overflow {
  background: color-mix(in srgb, var(--panel-muted) 18%, transparent);
}

.ai-runtime-context-summary__toggle {
  cursor: pointer;
}

.ai-runtime-context-summary__item.is-accent {
  border-color: color-mix(in srgb, var(--accent) 24%, var(--border-color) 76%);
}

.ai-runtime-context-summary__item.is-info {
  border-color: color-mix(in srgb, var(--info) 22%, var(--border-color) 78%);
}

.ai-runtime-context-summary__item.is-warning {
  border-color: color-mix(in srgb, var(--warning) 22%, var(--border-color) 78%);
}

.ai-runtime-context-summary__item-label,
.ai-runtime-context-summary__item-detail {
  font-size: 11px;
  line-height: 1.4;
}

.ai-runtime-context-summary__item-label {
  color: var(--text-primary);
  font-weight: 600;
  white-space: nowrap;
}

.ai-runtime-context-summary__item-detail {
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 18ch;
}
</style>
