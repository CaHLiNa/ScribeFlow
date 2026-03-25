<template>
  <div class="ui-input-shell" :class="[shellClass, propsShellClass]">
    <span v-if="$slots.prefix" class="ui-input-affix">
      <slot name="prefix" />
    </span>
    <input
      ref="inputEl"
      v-bind="$attrs"
      :value="modelValue"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      class="ui-input-control"
      :class="{ 'is-monospace': monospace }"
      @input="onInput"
      @focus="(event) => emit('focus', event)"
      @blur="(event) => emit('blur', event)"
      @keydown="(event) => emit('keydown', event)"
    />
    <span v-if="$slots.suffix" class="ui-input-affix">
      <slot name="suffix" />
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
    type: [String, Number],
    default: '',
  },
  modelModifiers: {
    type: Object,
    default: () => ({}),
  },
  type: {
    type: String,
    default: 'text',
  },
  placeholder: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  monospace: {
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

const emit = defineEmits(['update:modelValue', 'focus', 'blur', 'keydown'])

const shellClass = computed(() => [
  `ui-input-shell--${props.size}`,
  {
    'is-disabled': props.disabled,
  },
])
const propsShellClass = computed(() => props.shellClass)

function onInput(event) {
  const nextValue = props.modelModifiers.trim ? event.target.value.trim() : event.target.value

  if (props.modelModifiers.number) {
    const parsed = Number.parseFloat(nextValue)
    emit('update:modelValue', Number.isNaN(parsed) ? nextValue : parsed)
    return
  }

  emit('update:modelValue', nextValue)
}

const inputEl = ref(null)

function focus() {
  inputEl.value?.focus()
}

function select() {
  inputEl.value?.select?.()
}

function blur() {
  inputEl.value?.blur?.()
}

defineExpose({
  focus,
  select,
  blur,
  inputEl,
})
</script>

<style scoped>
.ui-input-shell {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-base);
  color: var(--text-primary);
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    background-color 140ms ease;
}

.ui-input-shell:focus-within {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.ui-input-shell.is-disabled {
  opacity: 0.55;
}

.ui-input-shell--sm {
  min-height: 28px;
  padding: 0 var(--space-2);
}

.ui-input-shell--md {
  min-height: 32px;
  padding: 0 var(--space-3);
}

.ui-input-shell--lg {
  min-height: 36px;
  padding: 0 var(--space-3);
}

.ui-input-control {
  width: 100%;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
}

.ui-input-control::placeholder {
  color: var(--text-muted);
  opacity: 0.72;
}

.ui-input-control.is-monospace {
  font-family: var(--font-mono);
}

.ui-input-affix {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  flex-shrink: 0;
}
</style>
