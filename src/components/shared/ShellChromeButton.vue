<template>
  <UiButton
    type="button"
    variant="ghost"
    :size="size"
    icon-only
    class="shell-chrome-button"
    :class="{ 'is-active': active }"
    :title="title"
    :aria-label="ariaLabel || title"
    :disabled="disabled"
  >
    <slot />
  </UiButton>
</template>

<script setup>
import UiButton from './ui/UiButton.vue'

defineProps({
  active: { type: Boolean, default: false },
  title: { type: String, default: '' },
  ariaLabel: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  size: { type: String, default: 'icon-md' },
})
</script>

<style scoped>
.shell-chrome-button {
  position: relative;
  opacity: 0.68;
  border-radius: 8px;
  color: var(--text-muted);
  transition:
    background-color 140ms ease,
    color 140ms ease,
    opacity 140ms ease,
    border-color 140ms ease,
    box-shadow 140ms ease;
}

.shell-chrome-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--text-primary) 4%, transparent);
  color: var(--text-primary);
  opacity: 1;
}

.shell-chrome-button.is-active {
  background: transparent;
  color: var(--text-primary);
  opacity: 1;
}

.shell-chrome-button.is-active::before {
  content: '';
  position: absolute;
  top: 7px;
  bottom: 7px;
  left: 2px;
  width: 2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 58%, transparent);
}
</style>
