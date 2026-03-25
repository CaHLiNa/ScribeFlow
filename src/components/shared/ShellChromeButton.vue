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
  opacity: 0.92;
  border-radius: var(--radius-sm);
}

.shell-chrome-button.is-active {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--text-primary);
  opacity: 1;
}
</style>
