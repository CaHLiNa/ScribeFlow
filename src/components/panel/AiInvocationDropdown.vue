<template>
  <div v-if="visible && suggestions.length > 0" class="ai-invocation-dropdown">
    <template
      v-for="(suggestion, index) in suggestions"
      :key="`${suggestion.prefix}:${suggestion.id}`"
    >
      <div v-if="shouldShowGroup(index)" class="ai-invocation-dropdown__group">
        {{ suggestion.groupLabel }}
      </div>
      <button
        type="button"
        class="ai-invocation-dropdown__item"
        :class="{ 'is-active': index === activeIndex }"
        @mousedown.prevent="$emit('select', suggestion)"
      >
        <div class="ai-invocation-dropdown__row">
          <span class="ai-invocation-dropdown__title">{{ suggestion.label }}</span>
          <span class="ai-invocation-dropdown__badge">{{ suggestion.prefix }}</span>
        </div>
        <div v-if="suggestion.description" class="ai-invocation-dropdown__description">
          {{ suggestion.description }}
        </div>
      </button>
    </template>
  </div>
</template>

<script setup>
const props = defineProps({
  visible: { type: Boolean, default: false },
  suggestions: { type: Array, default: () => [] },
  activeIndex: { type: Number, default: 0 },
})

defineEmits(['select'])

function shouldShowGroup(index = 0) {
  if (index <= 0) return true
  const current = props.suggestions[index]?.groupKey || ''
  const previous = props.suggestions[index - 1]?.groupKey || ''
  return current !== previous
}
</script>

<style scoped>
.ai-invocation-dropdown {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid color-mix(in srgb, var(--border-color) 34%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-raised) 78%, transparent);
  backdrop-filter: blur(28px);
  box-shadow:
    0 14px 34px rgba(0, 0, 0, 0.14),
    0 0 0 1px color-mix(in srgb, var(--border-color) 10%, transparent);
  z-index: 100;
}

.ai-invocation-dropdown__group {
  margin: 6px 6px 3px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
  text-transform: uppercase;
}

.ai-invocation-dropdown__item {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  outline: none;
}

.ai-invocation-dropdown__item:hover,
.ai-invocation-dropdown__item.is-active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--text-primary);
}

.ai-invocation-dropdown__row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.ai-invocation-dropdown__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  color: inherit;
}

.ai-invocation-dropdown__badge {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
  color: var(--text-tertiary);
  background: color-mix(in srgb, var(--surface-base) 52%, transparent);
}

.ai-invocation-dropdown__item.is-active .ai-invocation-dropdown__badge {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}

.ai-invocation-dropdown__description {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
