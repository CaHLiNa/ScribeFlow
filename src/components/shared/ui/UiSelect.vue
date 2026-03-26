<template>
  <div class="ui-select-shell" :class="[shellClass, propsShellClass]">
    <select
      ref="selectEl"
      v-bind="$attrs"
      :value="modelValue"
      :disabled="disabled"
      class="ui-select-control"
      @change="onChange"
      @focus="(event) => emit('focus', event)"
      @blur="(event) => emit('blur', event)"
    >
      <slot />
    </select>
    <span class="ui-select-caret" aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
        <path d="M1 3l4 4 4-4z" />
      </svg>
    </span>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps({
  modelValue: {
    type: [String, Number, Boolean],
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  shellClass: {
    type: [String, Array, Object],
    default: '',
  },
  size: {
    type: String,
    default: 'md',
  },
})

const emit = defineEmits(['update:modelValue', 'focus', 'blur'])

const shellClass = computed(() => [
  `ui-select-shell--${props.size}`,
  {
    'is-disabled': props.disabled,
  },
])
const propsShellClass = computed(() => props.shellClass)

function onChange(event) {
  emit('update:modelValue', event.target.value)
}

const selectEl = ref(null)

defineExpose({
  selectEl,
  focus: () => selectEl.value?.focus(),
})
</script>

<style scoped>
.ui-select-shell {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-base);
  color: var(--text-primary);
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    background-color 140ms ease;
}

.ui-select-shell:focus-within {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.ui-select-shell.is-disabled {
  opacity: 0.55;
}

.ui-select-shell--sm {
  min-height: 28px;
}

.ui-select-shell--md {
  min-height: 32px;
}

.ui-select-shell--lg {
  min-height: 36px;
}

.ui-select-control {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 0 calc(var(--space-4) + 16px) 0 var(--space-3);
}

.ui-select-caret {
  position: absolute;
  top: 50%;
  right: var(--space-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  pointer-events: none;
  transform: translateY(-50%);
}
</style>
