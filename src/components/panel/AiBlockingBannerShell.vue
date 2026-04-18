<template>
  <div
    class="ai-blocking-banner"
    :class="toneClass"
  >
    <div v-if="title || body || $slots.copy" class="ai-blocking-banner__copy">
      <div v-if="title" class="ai-blocking-banner__title">{{ title }}</div>
      <div v-if="body" class="ai-blocking-banner__body">{{ body }}</div>
      <slot name="copy" />
    </div>

    <slot />

    <div v-if="$slots.actions" class="ai-blocking-banner__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  tone: { type: String, default: 'info' },
  title: { type: String, default: '' },
  body: { type: String, default: '' },
})

const toneClass = computed(() => `is-${String(props.tone || 'info').trim() || 'info'}`)
</script>

<style scoped>
.ai-blocking-banner {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--border-color) 24%, transparent);
  background: color-mix(in srgb, var(--panel-muted) 8%, transparent);
}

.ai-blocking-banner.is-info {
  border-color: color-mix(in srgb, var(--info) 24%, var(--border-color) 76%);
  background: color-mix(in srgb, var(--info) 8%, transparent);
}

.ai-blocking-banner.is-warning {
  border-color: color-mix(in srgb, var(--warning) 24%, var(--border-color) 76%);
  background: color-mix(in srgb, var(--warning) 7%, transparent);
}

.ai-blocking-banner.is-accent {
  border-color: color-mix(in srgb, var(--accent) 28%, var(--border-color) 72%);
  background: color-mix(in srgb, var(--accent) 9%, transparent);
}

.ai-blocking-banner__copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-blocking-banner__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.ai-blocking-banner__body {
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary);
  white-space: pre-wrap;
}

.ai-blocking-banner__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
