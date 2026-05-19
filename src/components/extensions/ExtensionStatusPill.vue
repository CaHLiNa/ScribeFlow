<template>
  <span
    class="extension-status-pill"
    :class="toneClass"
    :title="title"
  >
    {{ label }}
  </span>
</template>

<script setup lang="ts">
defineProps({
  label: { type: String, default: '' },
  title: { type: String, default: '' },
  toneClass: { type: String, default: '' },
})
</script>

<style scoped>
.extension-status-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 3px 8px;
  background: color-mix(in srgb, var(--surface-hover) 82%, transparent);
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 600;
}

.extension-status-pill.is-success {
  background: color-mix(in srgb, var(--success) 18%, transparent);
}

.extension-status-pill.is-warning {
  background: color-mix(in srgb, var(--warning) 18%, transparent);
}

.extension-status-pill.is-danger,
.extension-status-pill.is-error {
  background: color-mix(in srgb, var(--error) 18%, transparent);
}
</style>
