<template>
  <div class="ui-range-input-shell" :class="[shellClass, propsShellClass]">
    <input
      ref="inputEl"
      v-bind="$attrs"
      :value="modelValue"
      type="range"
      :disabled="disabled"
      class="ui-range-input-control"
      @input="onInput"
      @change="onChange"
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
    type: [String, Number],
    default: 0,
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

const emit = defineEmits(['update:modelValue', 'focus', 'blur', 'change'])

const propsShellClass = computed(() => [
  {
    'is-disabled': props.disabled,
  },
  props.shellClass,
])

function normalizeValue(value) {
  const parsed = Number.parseFloat(String(value))
  return Number.isNaN(parsed) ? value : parsed
}

function onInput(event) {
  emit('update:modelValue', normalizeValue(event.target.value))
}

function onChange(event) {
  emit('change', normalizeValue(event.target.value))
}

const inputEl = ref(null)

defineExpose({
  inputEl,
  focus: () => inputEl.value?.focus(),
})
</script>

<style scoped>
.ui-range-input-shell {
  display: inline-flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  min-height: 24px;
  border-radius: var(--radius-md);
  transition:
    box-shadow 140ms ease,
    opacity 140ms ease;
}

.ui-range-input-shell:focus-within {
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.ui-range-input-shell.is-disabled {
  opacity: 0.55;
}

.ui-range-input-control {
  width: 100%;
  min-width: 0;
  margin: 0;
  accent-color: var(--accent);
  background: transparent;
  cursor: pointer;
}
</style>
