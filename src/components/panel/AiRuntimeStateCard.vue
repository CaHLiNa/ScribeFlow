<template>
  <div v-if="visible" class="ai-runtime-state-card" :class="toneClass">
    <div class="ai-runtime-state-card__copy">
      <div class="ai-runtime-state-card__title">{{ title }}</div>
      <div v-if="body" class="ai-runtime-state-card__body">{{ body }}</div>
    </div>

    <div v-if="displayItems.length > 0 || overflowCount > 0" class="ai-runtime-state-card__list">
      <div
        v-for="item in displayItems"
        :key="item.key || item.label"
        class="ai-runtime-state-card__item"
      >
        <span class="ai-runtime-state-card__item-label">{{ item.label }}</span>
        <span v-if="item.detail" class="ai-runtime-state-card__item-detail">{{ item.detail }}</span>
      </div>
      <button
        v-if="overflowCount > 0 && !expanded"
        type="button"
        class="ai-runtime-state-card__item ai-runtime-state-card__item--overflow ai-runtime-state-card__toggle"
        @click="expanded = true"
      >
        <span class="ai-runtime-state-card__item-label">{{ t('+{count} more', { count: overflowCount }) }}</span>
      </button>
      <button
        v-else-if="expanded && normalizedItems.length > collapsedItems.length"
        type="button"
        class="ai-runtime-state-card__item ai-runtime-state-card__item--overflow ai-runtime-state-card__toggle"
        @click="expanded = false"
      >
        <span class="ai-runtime-state-card__item-label">{{ t('Show less') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from '../../i18n'

const props = defineProps({
  visible: { type: Boolean, default: true },
  tone: { type: String, default: 'info' },
  title: { type: String, default: '' },
  body: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  maxVisibleItems: { type: Number, default: 3 },
  maxDetailLength: { type: Number, default: 56 },
})

const { t } = useI18n()
const toneClass = computed(() => `is-${String(props.tone || 'info').trim() || 'info'}`)
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

function truncateText(value = '', maxLength = 56) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ')
  if (!normalized) return ''
  const limit = Math.max(12, Number(maxLength || 56))
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit - 1).trimEnd()}…`
}
</script>

<style scoped>
.ai-runtime-state-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 9px 11px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--border-color) 22%, transparent);
  background: color-mix(in srgb, var(--panel-muted) 8%, transparent);
}

.ai-runtime-state-card.is-accent {
  border-color: color-mix(in srgb, var(--accent) 22%, var(--border-color) 78%);
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}

.ai-runtime-state-card.is-info {
  border-color: color-mix(in srgb, var(--info) 20%, var(--border-color) 80%);
  background: color-mix(in srgb, var(--info) 5%, transparent);
}

.ai-runtime-state-card.is-warning {
  border-color: color-mix(in srgb, var(--warning) 20%, var(--border-color) 80%);
  background: color-mix(in srgb, var(--warning) 5%, transparent);
}

.ai-runtime-state-card__copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ai-runtime-state-card__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.ai-runtime-state-card__body {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
  white-space: pre-wrap;
}

.ai-runtime-state-card__list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ai-runtime-state-card__item {
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

.ai-runtime-state-card__item--overflow {
  background: color-mix(in srgb, var(--panel-muted) 18%, transparent);
}

.ai-runtime-state-card__toggle {
  cursor: pointer;
}

.ai-runtime-state-card__item-label,
.ai-runtime-state-card__item-detail {
  font-size: 11px;
  line-height: 1.4;
}

.ai-runtime-state-card__item-label {
  color: var(--text-primary);
  font-weight: 600;
  white-space: nowrap;
}

.ai-runtime-state-card__item-detail {
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 22ch;
}
</style>
