<template>
  <button
    type="button"
    class="ui-switch"
    :class="switchClass"
    :aria-pressed="modelValue ? 'true' : 'false'"
    :aria-label="ariaLabel || title"
    :title="title"
    :disabled="disabled"
    @click="toggle"
  >
    <span class="ui-switch-knob"></span>
  </button>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  size: {
    type: String,
    default: 'md',
  },
  title: {
    type: String,
    default: '',
  },
  ariaLabel: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue'])

const switchClass = computed(() => [
  `ui-switch--${props.size}`,
  {
    'is-on': props.modelValue,
  },
])

function toggle() {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<style scoped>
.ui-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: var(--surface-muted);
  cursor: pointer;
  transition:
    background-color 140ms ease,
    opacity 140ms ease,
    box-shadow 140ms ease;
}

.ui-switch:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.ui-switch:disabled {
  opacity: 0.45;
  cursor: default;
}

.ui-switch--sm {
  width: 28px;
  height: 16px;
}

.ui-switch--md {
  width: 32px;
  height: 18px;
}

.ui-switch.is-on {
  background: var(--accent);
}

.ui-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: white;
  transition: transform 140ms ease;
}

.ui-switch--sm .ui-switch-knob {
  width: 12px;
  height: 12px;
}

.ui-switch--md .ui-switch-knob {
  width: 14px;
  height: 14px;
}

.ui-switch--sm.is-on .ui-switch-knob {
  transform: translateX(12px);
}

.ui-switch--md.is-on .ui-switch-knob {
  transform: translateX(14px);
}
</style>
