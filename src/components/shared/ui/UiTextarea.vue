<template>
  <div class="ui-textarea-shell" :class="[shellClass, propsShellClass]">
    <textarea
      ref="textareaEl"
      v-bind="$attrs"
      :value="internalValue"
      :rows="rows"
      :placeholder="placeholder"
      :disabled="disabled"
      class="ui-textarea-control"
      :class="{ 'is-monospace': monospace }"
      @input="onInput"
      @compositionstart="onCompositionStart"
      @compositionend="onCompositionEnd"
      @focus="(event) => emit('focus', event)"
      @blur="(event) => emit('blur', event)"
      @keydown="(event) => emit('keydown', event)"
    ></textarea>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'

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
  },
})

const emit = defineEmits(['update:modelValue', 'focus', 'blur', 'keydown'])

const shellClass = computed(() => [
  `ui-textarea-shell--${props.variant}`,
  {
    'is-disabled': props.disabled,
  },
])
const propsShellClass = computed(() => props.shellClass)
const textareaEl = ref(null)
const internalValue = ref(String(props.modelValue || ''))
const isComposing = ref(false)

function clampSelection(value = 0, max = 0) {
  return Math.max(0, Math.min(Number(value || 0), max))
}

function measureCommonPrefix(left = '', right = '') {
  const max = Math.min(left.length, right.length)
  let index = 0
  while (index < max && left[index] === right[index]) {
    index += 1
  }
  return index
}

function measureCommonSuffix(left = '', right = '', prefix = 0) {
  const leftRemaining = left.length - prefix
  const rightRemaining = right.length - prefix
  const max = Math.min(leftRemaining, rightRemaining)
  let index = 0
  while (
    index < max &&
    left[left.length - 1 - index] === right[right.length - 1 - index]
  ) {
    index += 1
  }
  return index
}

function remapOffset(offset = 0, previousValue = '', nextValue = '') {
  if (previousValue === nextValue) return clampSelection(offset, nextValue.length)

  const prefix = measureCommonPrefix(previousValue, nextValue)
  const suffix = measureCommonSuffix(previousValue, nextValue, prefix)
  const previousChangeEnd = previousValue.length - suffix
  const nextChangeEnd = nextValue.length - suffix
  const safeOffset = clampSelection(offset, previousValue.length)

  if (safeOffset <= prefix) return safeOffset
  if (safeOffset >= previousChangeEnd) {
    return clampSelection(nextChangeEnd + (safeOffset - previousChangeEnd), nextValue.length)
  }
  return clampSelection(nextChangeEnd, nextValue.length)
}

function restoreSelection(previousValue = '', nextValue = '', selection = null) {
  const el = textareaEl.value
  if (!el || !selection) return

  const nextStart = remapOffset(selection.start, previousValue, nextValue)
  const nextEnd = remapOffset(selection.end, previousValue, nextValue)
  const nextDirection = selection.direction || 'none'

  nextTick(() => {
    if (!textareaEl.value || document.activeElement !== textareaEl.value) return
    textareaEl.value.setSelectionRange(nextStart, nextEnd, nextDirection)
  })
}

watch(
  () => props.modelValue,
  (value) => {
    const nextValue = String(value || '')
    if (nextValue === internalValue.value) return

    const el = textareaEl.value
    const shouldPreserveSelection =
      !!el && document.activeElement === el && !isComposing.value

    const selection = shouldPreserveSelection
      ? {
          start: el.selectionStart ?? internalValue.value.length,
          end: el.selectionEnd ?? internalValue.value.length,
          direction: el.selectionDirection || 'none',
        }
      : null

    const previousValue = internalValue.value
    internalValue.value = nextValue

    if (selection) {
      restoreSelection(previousValue, nextValue, selection)
    }
  }
)

function onInput(event) {
  const nextValue = String(event.target.value || '')
  internalValue.value = nextValue
  if (isComposing.value) return
  emit('update:modelValue', nextValue)
}

function onCompositionStart() {
  isComposing.value = true
}

function onCompositionEnd(event) {
  isComposing.value = false
  onInput(event)
}

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
