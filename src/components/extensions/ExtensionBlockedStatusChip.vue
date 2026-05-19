<template>
  <span
    class="extension-blocked-status-chip"
    :class="[toneClass, compact ? 'is-compact' : '']"
    :title="title"
  >
    {{ label }}
  </span>
</template>

<script setup lang="ts">
const props = defineProps({
  label: { type: String, default: '' },
  title: { type: String, default: '' },
  toneClass: { type: String, default: '' },
  compact: { type: Boolean, default: false },
})
</script>

<style scoped>
.extension-blocked-status-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 3px 8px;
  background: color-mix(in srgb, var(--surface-hover) 82%, transparent);
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.extension-blocked-status-chip.is-compact {
  padding: 1px 0;
  background: transparent;
  font-size: 10px;
}

.extension-blocked-status-chip.is-warning {
  background: color-mix(in srgb, var(--warning) 18%, transparent);
}

.extension-blocked-status-chip.is-warning.is-compact {
  background: transparent;
  color: color-mix(in srgb, var(--warning) 78%, var(--text-primary));
}

.extension-blocked-status-chip.is-blocked {
  background: color-mix(in srgb, var(--error) 16%, transparent);
  color: color-mix(in srgb, var(--error) 78%, var(--text-primary));
}

.extension-blocked-status-chip.is-blocked.is-compact {
  background: transparent;
}
</style>
