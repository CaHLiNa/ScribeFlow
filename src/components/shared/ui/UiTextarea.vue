<template>
  <div class="ui-textarea-shell" :class="[shellClass, propsShellClass]">
    <textarea
      ref="textareaEl"
      v-bind="$attrs"
      :value="modelValue"
      :rows="rows"
      :placeholder="placeholder"
      :disabled="disabled"
      class="ui-textarea-control"
      :class="{ 'is-monospace': monospace }"
      @input="onInput"
      @focus="(event) => emit('focus', event)"
      @blur="(event) => emit('blur', event)"
      @keydown="(event) => emit('keydown', event)"
    ></textarea>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  rows: {
    type: [String, Number],
    default: 3,
  },
  monospace: {
    type: Boolean,
    default: false,
  },
  shellClass: {
    type: [String, Array, Object],
    default: '',
  },
  variant: {
    type: String,
    default: 'default',
  }
})

const emit = defineEmits(['update:modelValue', 'focus', 'blur', 'keydown'])

const shellClass = computed(() => [
  `ui-textarea-shell--${props.variant}`,
  {
    'is-disabled': props.disabled,
  },
])
const propsShellClass = computed(() => props.shellClass)

function onInput(event) {
  emit('update:modelValue', event.target.value)
}

const textareaEl = ref(null)

function focus() {
  textareaEl.value?.focus()
}

function select() {
  textareaEl.value?.select?.()
}

function blur() {
  textareaEl.value?.blur?.()
}

defineExpose({
  focus,
  select,
  blur,
  textareaEl,
})
</script>

<style scoped>
.ui-textarea-shell {
  display: flex;
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

.ui-textarea-shell:focus-within {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
  box-shadow: 0 0 0 2px var(--focus-ring);
}

.ui-textarea-shell.is-disabled {
  opacity: 0.55;
}

/* Ghost variant */
.ui-textarea-shell--ghost {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.ui-textarea-shell--ghost:hover:not(.is-disabled):not(:focus-within) {
  background: color-mix(in srgb, var(--surface-hover) 50%, transparent);
}

.ui-textarea-shell--ghost:focus-within {
  background: var(--surface-base);
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--focus-ring);
}

.ui-textarea-shell--ghost .ui-textarea-control {
  padding: 4px;
}

.ui-textarea-control {
  width: 100%;
  min-width: 0;
  min-height: 64px;
  resize: vertical;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: var(--line-height-regular);
  padding: var(--space-2) var(--space-3);
}

.ui-textarea-control::placeholder {
  color: var(--text-muted);
  opacity: 0.72;
}

.ui-textarea-control.is-monospace {
  font-family: var(--font-mono);
}
</style>