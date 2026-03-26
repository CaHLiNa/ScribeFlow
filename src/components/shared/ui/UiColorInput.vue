<template>
  <div class="ui-color-input-shell" :class="[shellClass, propsShellClass]">
    <input
      ref="inputEl"
      v-bind="$attrs"
      :value="modelValue"
      type="color"
      :disabled="disabled"
      class="ui-color-input-control"
      @input="onInput"
      @focus="(event) => emit('focus', event)"
      @blur="(event) => emit('blur', event)"
    />
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
    default: '#000000',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  shellClass: {
    type: [String, Array, Object],
    default: '',
  },
})

const emit = defineEmits(['update:modelValue', 'focus', 'blur'])

const propsShellClass = computed(() => [
  {
    'is-disabled': props.disabled,
  },
  props.shellClass,
])

function onInput(event) {
  emit('update:modelValue', event.target.value)
}

const inputEl = ref(null)

defineExpose({
  inputEl,
  focus: () => inputEl.value?.focus(),
  click: () => inputEl.value?.click(),
})
</script>

<style scoped>
.ui-color-input-shell {
  display: inline-flex;
  width: 100%;
  min-width: 0;
  min-height: 28px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-base);
  color: var(--text-primary);
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    background-color 140ms ease,
    opacity 140ms ease;
}

.ui-color-input-shell:focus-within {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.ui-color-input-shell.is-disabled {
  opacity: 0.55;
}

.ui-color-input-control {
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: inherit;
  padding: 0;
  border: none;
  border-radius: inherit;
  background: transparent;
  cursor: pointer;
}

.ui-color-input-control::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.ui-color-input-control::-webkit-color-swatch {
  border: 1px solid color-mix(in srgb, var(--border) 92%, transparent);
  border-radius: calc(var(--radius-md) - 2px);
}

.ui-color-input-control::-moz-color-swatch {
  border: 1px solid color-mix(in srgb, var(--border) 92%, transparent);
  border-radius: calc(var(--radius-md) - 2px);
}
</style>
