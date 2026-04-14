<template>
  <button
    ref="buttonRef"
    :type="type"
    class="ui-button"
    :class="buttonClass"
    :title="title"
    :aria-label="ariaLabel || title"
    :disabled="isDisabled"
  >
    <span v-if="loading" class="ui-button-spinner" aria-hidden="true"></span>
    <template v-else-if="contentMode === 'raw'">
      <slot />
    </template>
    <template v-else>
      <span v-if="$slots.leading" class="ui-button-leading">
        <slot name="leading" />
      </span>
      <span v-if="!iconOnly" class="ui-button-label">
        <slot />
      </span>
      <slot v-else />
      <span v-if="$slots.trailing && !iconOnly" class="ui-button-trailing">
        <slot name="trailing" />
      </span>
    </template>
  </button>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  variant: { type: String, default: 'secondary' },
  size: { type: String, default: 'md' },
  type: { type: String, default: 'button' },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  block: { type: Boolean, default: false },
  iconOnly: { type: Boolean, default: false },
  title: { type: String, default: '' },
  ariaLabel: { type: String, default: '' },
  active: { type: Boolean, default: false },
  contentMode: { type: String, default: 'label' },
})

const buttonRef = ref(null)
const isDisabled = computed(() => props.disabled || props.loading)
const buttonClass = computed(() => [
  `ui-button--${props.variant}`,
  `ui-button--${props.size}`,
  {
    'is-block': props.block,
    'is-icon-only': props.iconOnly,
    'is-loading': props.loading,
    'is-active': props.active,
    'is-raw-content': props.contentMode === 'raw',
  },
])

defineExpose({
  el: buttonRef,
  focus: () => buttonRef.value?.focus(),
  blur: () => buttonRef.value?.blur(),
  click: () => buttonRef.value?.click(),
  getBoundingClientRect: () => buttonRef.value?.getBoundingClientRect?.(),
})
</script>

/* START OF FILE src/components/shared/ui/UiButton.vue (只替换 style 部分) */
<style scoped>
.ui-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 6px; /* 从 12px 降为原生的 6px */
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.1s, border-color 0.1s, color 0.1s, opacity 0.1s; /* 加快动效，更干脆 */
}

.ui-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--focus-ring);
}

.ui-button:disabled {
  opacity: 0.5;
  cursor: default;
}

/* 降低高度，贴近原生比例 */
.ui-button--sm {
  min-height: 26px;
  padding: 0 10px;
  font-size: 12px;
}

.ui-button--md {
  min-height: 30px;
  padding: 0 12px;
  font-size: 13px;
}

.ui-button--lg {
  min-height: 36px;
  padding: 0 16px;
  font-size: 14px;
}

.ui-button--icon-sm {
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 5px;
}

.ui-button--icon-xs {
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 4px;
}

.ui-button--icon-md {
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 6px;
}

/* 重构 Primary：去除非原生的高漫反射阴影，改用干净的边框和极简投影 */
.ui-button--primary {
  background: var(--button-primary-bg);
  border-color: color-mix(in srgb, var(--button-primary-bg) 80%, var(--border));
  color: var(--button-primary-text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); /* 极简的物理阴影 */
}

.ui-button--primary:hover:not(:disabled) {
  background: var(--button-primary-bg-hover);
}

.ui-button--secondary {
  background: var(--surface-base);
  border-color: color-mix(in srgb, var(--border) 80%, transparent);
  color: var(--text-primary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.ui-button--secondary:hover:not(:disabled) {
  border-color: var(--border);
  background: var(--surface-hover);
}

.ui-button--secondary:active:not(:disabled) {
  background: color-mix(in srgb, var(--surface-hover) 80%, transparent);
}

.ui-button--danger {
  background: var(--error);
  border-color: transparent;
  color: #fff;
}

.ui-button--danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--error) 80%, black);
}

.ui-button--ghost {
  color: var(--text-muted);
}

.ui-button--ghost:hover:not(:disabled) {
  background: var(--sidebar-item-hover);
  color: var(--text-primary);
}

.ui-button--ghost:active:not(:disabled) {
  background: color-mix(in srgb, var(--sidebar-item-hover) 80%, transparent);
}

.ui-button.is-block {
  width: 100%;
}

.ui-button.is-icon-only {
  gap: 0;
}

.ui-button.is-raw-content {
  line-height: var(--line-height-regular);
}

.ui-button-label {
  white-space: nowrap;
}

.ui-button-leading,
.ui-button-trailing {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ui-button-spinner {
  width: 12px;
  height: 12px;
  border: 1.5px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: ui-button-spin 0.8s linear infinite;
}

@keyframes ui-button-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
