<template>
  <button
    ref="buttonRef"
    type="button"
    class="ui-checkbox"
    :class="checkboxClass"
    role="checkbox"
    :aria-checked="modelValue ? 'true' : 'false'"
    :aria-label="ariaLabel || title"
    :disabled="disabled"
    :title="title"
    data-ui-checkbox="true"
    @click="toggle"
  >
    <span class="ui-checkbox-box" aria-hidden="true">
      <svg v-if="modelValue" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M2.5 6.2 4.9 8.5 9.5 3.7"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </span>
    <span v-if="$slots.default" class="ui-checkbox-label">
      <slot />
    </span>
  </button>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '',
  },
  ariaLabel: {
    type: String,
    default: '',
  },
  size: {
    type: String,
    default: 'md',
  },
})

const emit = defineEmits(['update:modelValue'])

const buttonRef = ref(null)
const checkboxClass = computed(() => [
  `ui-checkbox--${props.size}`,
  {
    'is-checked': props.modelValue,
    'is-disabled': props.disabled,
  },
])

function toggle() {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
}

defineExpose({
  el: buttonRef,
  focus: () => buttonRef.value?.focus(),
  blur: () => buttonRef.value?.blur(),
  click: () => buttonRef.value?.click(),
})
</script>

<style scoped>
.ui-checkbox {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
  padding: 0;
  transition:
    color 140ms ease,
    opacity 140ms ease,
    box-shadow 140ms ease;
}

.ui-checkbox:focus-visible {
  outline: none;
}

.ui-checkbox.is-disabled {
  opacity: 0.48;
  cursor: default;
}

.ui-checkbox-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-base);
  color: transparent;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    color 140ms ease,
    box-shadow 140ms ease;
}

.ui-checkbox:focus-visible .ui-checkbox-box {
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.ui-checkbox:hover:not(.is-disabled) .ui-checkbox-box {
  border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
  background: var(--surface-hover);
}

.ui-checkbox.is-checked .ui-checkbox-box {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}

.ui-checkbox--sm .ui-checkbox-box {
  width: 16px;
  height: 16px;
}

.ui-checkbox--md .ui-checkbox-box {
  width: 18px;
  height: 18px;
}

.ui-checkbox-label {
  min-width: 0;
  color: inherit;
  line-height: var(--line-height-regular);
}
</style>
