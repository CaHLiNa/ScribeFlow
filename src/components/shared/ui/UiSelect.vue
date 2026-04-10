<template>
  <div ref="shellRef" class="ui-select-shell" :class="[shellClassName, propsShellClass]">
    <button
      ref="triggerRef"
      type="button"
      class="ui-select-trigger"
      :disabled="disabled"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="listbox"
      :aria-label="triggerLabel"
      @click="toggleOpen"
      @focus="emit('focus', $event)"
      @blur="handleBlur"
      @keydown="handleTriggerKeydown"
    >
      <span class="ui-select-value">{{ selectedLabel }}</span>
      <span class="ui-select-caret" aria-hidden="true">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M1 3l4 4 4-4z" />
        </svg>
      </span>
    </button>

    <div v-if="open" class="ui-select-menu" role="listbox" :aria-label="triggerLabel">
      <button
        v-for="(option, index) in normalizedOptions"
        :key="getOptionKey(option, index)"
        type="button"
        class="ui-select-option"
        :class="{
          'is-selected': isSelected(option),
          'is-highlighted': index === highlightedIndex,
        }"
        :disabled="option.disabled"
        :aria-selected="isSelected(option) ? 'true' : 'false'"
        @mouseenter="setHighlightedIndex(index)"
        @click="selectOption(option)"
      >
        <span class="ui-select-option-label">{{ option.label }}</span>
        <span v-if="isSelected(option)" class="ui-select-option-check" aria-hidden="true">✓</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

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
  options: {
    type: Array,
    default: () => [],
  },
  ariaLabel: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue', 'focus', 'blur'])

const shellRef = ref(null)
const triggerRef = ref(null)
const open = ref(false)
const highlightedIndex = ref(-1)

const normalizedOptions = computed(() =>
  (props.options || []).map((option) => {
    if (option && typeof option === 'object' && 'value' in option) {
      return {
        value: option.value,
        label: option.label ?? String(option.value ?? ''),
        disabled: option.disabled === true,
      }
    }
    return {
      value: option,
      label: String(option ?? ''),
      disabled: false,
    }
  })
)

const shellClassName = computed(() => [
  `ui-select-shell--${props.size}`,
  {
    'is-disabled': props.disabled,
    'is-open': open.value,
  },
])

const propsShellClass = computed(() => props.shellClass)

const selectedOption = computed(
  () =>
    normalizedOptions.value.find((option) => sameValue(option.value, props.modelValue)) ||
    normalizedOptions.value.find((option) => !option.disabled) ||
    null
)

const selectedLabel = computed(() => selectedOption.value?.label || props.placeholder || '')

const triggerLabel = computed(() => props.ariaLabel || selectedLabel.value || 'Select')

function sameValue(a, b) {
  return String(a ?? '') === String(b ?? '')
}

function isSelected(option) {
  return sameValue(option?.value, props.modelValue)
}

function getOptionKey(option, index) {
  return `${String(option?.value ?? '')}:${index}`
}

function findNextEnabledIndex(startIndex, direction) {
  const options = normalizedOptions.value
  if (!options.length) return -1

  let index = startIndex
  for (let steps = 0; steps < options.length; steps += 1) {
    index = (index + direction + options.length) % options.length
    if (!options[index]?.disabled) return index
  }

  return -1
}

function syncHighlightedIndex() {
  const selectedIndex = normalizedOptions.value.findIndex(
    (option) => isSelected(option) && !option.disabled
  )
  highlightedIndex.value = selectedIndex >= 0 ? selectedIndex : findNextEnabledIndex(-1, 1)
}

function openMenu() {
  if (props.disabled || !normalizedOptions.value.length) return
  open.value = true
  syncHighlightedIndex()
}

function closeMenu() {
  open.value = false
  highlightedIndex.value = -1
}

function toggleOpen() {
  if (open.value) {
    closeMenu()
    return
  }
  openMenu()
}

function setHighlightedIndex(index) {
  if (normalizedOptions.value[index]?.disabled) return
  highlightedIndex.value = index
}

function selectOption(option) {
  if (!option || option.disabled) return
  emit('update:modelValue', option.value)
  closeMenu()
  triggerRef.value?.focus()
}

function moveHighlight(direction) {
  if (!open.value) openMenu()
  const startIndex = highlightedIndex.value >= 0 ? highlightedIndex.value : -1
  const nextIndex = findNextEnabledIndex(startIndex, direction)
  if (nextIndex >= 0) highlightedIndex.value = nextIndex
}

function commitHighlighted() {
  const option = normalizedOptions.value[highlightedIndex.value]
  if (option && !option.disabled) {
    selectOption(option)
  }
}

function handleTriggerKeydown(event) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveHighlight(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveHighlight(-1)
      break
    case 'Enter':
    case ' ':
      event.preventDefault()
      if (open.value) {
        commitHighlighted()
      } else {
        openMenu()
      }
      break
    case 'Escape':
      if (open.value) {
        event.preventDefault()
        closeMenu()
      }
      break
    case 'Home':
      if (open.value) {
        event.preventDefault()
        highlightedIndex.value = findNextEnabledIndex(-1, 1)
      }
      break
    case 'End':
      if (open.value) {
        event.preventDefault()
        highlightedIndex.value = findNextEnabledIndex(0, -1)
      }
      break
    default:
      break
  }
}

function handleBlur(event) {
  const nextTarget = event.relatedTarget
  if (!shellRef.value?.contains(nextTarget)) {
    closeMenu()
  }
  emit('blur', event)
}

function handlePointerDown(event) {
  if (!shellRef.value?.contains(event.target)) {
    closeMenu()
  }
}

watch(
  () => props.modelValue,
  () => {
    if (open.value) syncHighlightedIndex()
  }
)

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) closeMenu()
  }
)

onMounted(() => {
  window.addEventListener('pointerdown', handlePointerDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handlePointerDown)
})

defineExpose({
  el: triggerRef,
  focus: () => triggerRef.value?.focus(),
  blur: () => triggerRef.value?.blur(),
  click: () => triggerRef.value?.click(),
})
</script>

<style scoped>
.ui-select-shell {
  position: relative;
  display: inline-flex;
  width: 100%;
  min-width: 0;
}

.ui-select-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-base);
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    background-color 140ms ease,
    color 140ms ease;
  cursor: pointer;
}

.ui-select-trigger:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.ui-select-trigger:disabled {
  opacity: 0.55;
  cursor: default;
}

.ui-select-shell--sm .ui-select-trigger {
  min-height: 28px;
  padding: 0 32px 0 var(--space-3);
}

.ui-select-shell--md .ui-select-trigger {
  min-height: 32px;
  padding: 0 36px 0 var(--space-3);
}

.ui-select-shell--lg .ui-select-trigger {
  min-height: 36px;
  padding: 0 40px 0 var(--space-3);
}

.ui-select-value {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  transition:
    transform 140ms ease,
    color 140ms ease;
}

.ui-select-shell.is-open .ui-select-caret {
  transform: translateY(-50%) rotate(180deg);
  color: var(--text-secondary);
}

.ui-select-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: var(--z-dropdown);
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: max-content;
  padding: 4px;
  border: 1px solid color-mix(in srgb, var(--shell-border) 12%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-muted) 82%, var(--shell-surface));
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(18px) saturate(0.94);
}

.ui-select-option {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}

.ui-select-option:hover:not(:disabled),
.ui-select-option.is-highlighted:not(:disabled) {
  background: color-mix(in srgb, var(--surface-hover) 6%, transparent);
  color: var(--text-primary);
}

.ui-select-option.is-selected {
  color: var(--text-primary);
}

.ui-select-option:disabled {
  opacity: 0.45;
  cursor: default;
}

.ui-select-option-label {
  min-width: 0;
  flex: 1 1 auto;
}

.ui-select-option-check {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--accent) 72%, currentColor);
}
</style>
