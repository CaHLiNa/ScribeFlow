<template>
  <span
    class="extension-count-badge"
    :title="title"
  >
    {{ value }}
  </span>
</template>

<script setup lang="ts">
defineProps({
  value: { type: [String, Number], default: '' },
  title: { type: String, default: '' },
})
</script>

<style scoped>
.extension-count-badge {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  min-height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 18%, var(--surface-hover));
  color: var(--text-primary);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
}
</style>
