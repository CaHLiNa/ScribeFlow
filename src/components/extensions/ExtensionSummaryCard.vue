<template>
  <div
    class="extension-summary-card"
    :class="toneClass"
  >
    <div class="extension-summary-card__title">{{ title }}</div>
    <div class="extension-summary-card__value">{{ value }}</div>
  </div>
</template>

<script setup lang="ts">
defineProps({
  title: { type: String, default: '' },
  value: { type: String, default: '' },
  toneClass: { type: String, default: '' },
})
</script>

<style scoped>
.extension-summary-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  border: 1px solid color-mix(in srgb, var(--border) 38%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-base) 76%, transparent);
  padding: 10px;
}

.extension-summary-card.is-success {
  border-color: color-mix(in srgb, var(--success) 34%, var(--border));
}

.extension-summary-card.is-warning {
  border-color: color-mix(in srgb, var(--warning) 34%, var(--border));
}

.extension-summary-card.is-danger,
.extension-summary-card.is-error {
  border-color: color-mix(in srgb, var(--error) 34%, var(--border));
}

.extension-summary-card__title {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.extension-summary-card__value {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
</style>
