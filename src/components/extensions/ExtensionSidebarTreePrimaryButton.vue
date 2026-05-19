<template>
  <button
    type="button"
    class="extension-tree-primary-button"
    :class="[
      selected ? 'is-selected' : '',
      focused ? 'is-focused' : '',
      blocked ? 'is-blocked' : '',
    ]"
    :title="displayTitle"
    :disabled="displayDisabled"
    @click="$emit('click', $event)"
  >
    <span v-if="icon" class="extension-tree-primary-button__icon">{{ icon }}</span>
    <span class="extension-tree-primary-button__label">{{ label }}</span>
    <span v-if="meta" class="extension-tree-primary-button__meta">{{ meta }}</span>
    <ExtensionBlockedStatusChip
      v-if="blocked && blockedLabel"
      :label="blockedLabel"
      :title="blockedMessage || displayTitle"
      :tone-class="blockedToneClass"
      compact
    />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ExtensionBlockedStatusChip from './ExtensionBlockedStatusChip.vue'

const props = defineProps({
  selected: { type: Boolean, default: false },
  focused: { type: Boolean, default: false },
  blocked: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  icon: { type: String, default: '' },
  label: { type: String, default: '' },
  meta: { type: String, default: '' },
  title: { type: String, default: '' },
  blockedLabel: { type: String, default: '' },
  blockedMessage: { type: String, default: '' },
  blockedToneClass: { type: String, default: '' },
})

defineEmits(['click'])

const displayTitle = computed(() => (
  props.blocked ? (props.blockedMessage || props.title) : props.title
))

const displayDisabled = computed(() => props.disabled || props.blocked)
</script>

<style scoped>
.extension-tree-primary-button {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  border: 1px solid color-mix(in srgb, var(--border) 35%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface-base) 78%, transparent);
  padding: 10px;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.extension-tree-primary-button:disabled {
  cursor: not-allowed;
}

.extension-tree-primary-button:hover:not(:disabled) {
  background: var(--surface-hover);
}

.extension-tree-primary-button.is-selected {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-base));
}

.extension-tree-primary-button.is-focused {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent);
}

.extension-tree-primary-button.is-blocked {
  border-color: color-mix(in srgb, var(--warning) 34%, var(--border));
}

.extension-tree-primary-button__icon {
  color: var(--text-muted);
  font-size: 11px;
}

.extension-tree-primary-button__label {
  min-width: 0;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
}

.extension-tree-primary-button__meta {
  color: var(--text-muted);
  font-size: 11px;
}
</style>
