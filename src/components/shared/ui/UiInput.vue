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
  variant: {
    type: String,
    default: 'default',
  },
})

const emit = defineEmits(['update:modelValue', 'focus', 'blur', 'keydown'])

const shellClass = computed(() => [
  `ui-input-shell--${props.size}`,
  `ui-input-shell--${props.variant}`,
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

/* START OF FILE src/components/shared/ui/UiInput.vue (只替换 style 部分) */
<style scoped>
.ui-input-shell {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface-base) 82%, transparent);
  color: var(--text-primary);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--fg-primary) 4%, transparent);
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    background-color 140ms ease;
}

.ui-input-shell:focus-within {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  background: color-mix(in srgb, var(--surface-base) 94%, transparent);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent),
    0 0 0 1px var(--accent);
}

.ui-input-shell.is-disabled {
  opacity: 0.55;
}

/* ========================================================
   Ghost Variant: macOS Native Inspector Style 
======================================================== */
.ui-input-shell--ghost {
  border: 1px solid transparent;
  background: transparent;
  box-shadow: none;
  /* 取消 padding-inline 的 hack，交由 control 处理，以便文本完美左对齐 */
  padding-inline: 0 !important;
}

.ui-input-shell--ghost:hover:not(.is-disabled):not(:focus-within) {
  background: color-mix(in srgb, var(--surface-hover) 40%, transparent);
  border-color: transparent;
}

.ui-input-shell--ghost:focus-within {
  background: var(--surface-base);
  border-color: var(--border-subtle);
  box-shadow: 0 1px 3px rgba(0,0,0,0.05); /* 原生的微弱卡片感 */
}

/* 抵消 ghost 下的 control padding，保持静默态的绝对对齐 */
.ui-input-shell--ghost .ui-input-control {
  padding-left: 6px !important;
  padding-right: 6px !important;
}

.ui-input-shell--sm {
  height: 24px;
  padding: 0 8px;
}

.ui-input-shell--md {
  height: 28px;
  padding: 0 10px;
}

.ui-input-shell--lg {
  height: 32px;
  padding: 0 12px;
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
