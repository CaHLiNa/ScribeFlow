<template>
  <div v-if="entries.length > 1" class="sidebar-chrome">
    <div class="sidebar-chrome-strip">
      <ShellChromeButton
        v-for="entry in entries"
        :key="entry.key"
        :active="entry.key === activeKey"
        size="icon-sm"
        :title="entry.title"
        :aria-label="entry.label"
        @click="$emit('select', entry.key)"
      >
        <component :is="entry.icon" :size="16" :stroke-width="1.6" />
      </ShellChromeButton>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import ShellChromeButton from './ShellChromeButton.vue'

const props = defineProps({
  entries: {
    type: Array,
    default: () => [],
  },
  activeKey: {
    type: String,
    default: '',
  },
})

defineEmits(['select'])

const entries = computed(() => (Array.isArray(props.entries) ? props.entries : []))
</script>

<style scoped>
.sidebar-chrome {
  flex: 0 0 auto;
  min-height: 0;
  padding: 4px 6px 3px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-base);
}

.sidebar-chrome-strip {
  display: flex;
  align-items: center;
  gap: 2px;
}
</style>
