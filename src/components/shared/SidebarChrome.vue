<template>
  <div v-if="shouldRenderChrome" class="sidebar-chrome">
    <div v-if="entries.length > 1" class="sidebar-chrome-strip">
      <ShellChromeButton
        v-for="entry in entries"
        :key="entry.key"
        :active="entry.key === activeKey"
        size="icon-xs"
        :title="entry.title"
        :aria-label="entry.label"
        @click="$emit('select', entry.key)"
      >
        <component :is="entry.icon" :size="12" :stroke-width="1.6" />
      </ShellChromeButton>
    </div>
    <div v-if="$slots.trailing" class="sidebar-chrome-trailing">
      <slot name="trailing" />
    </div>
  </div>
</template>

<script setup>
import { computed, useSlots } from 'vue'
import ShellChromeButton from './ShellChromeButton.vue'
import { shouldRenderSidebarChrome as resolveSidebarChromeVisibility } from '../../shared/sidebarChromeVisibility.js'

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

const slots = useSlots()
const entries = computed(() => (Array.isArray(props.entries) ? props.entries : []))
const shouldRenderChrome = computed(() =>
  resolveSidebarChromeVisibility(entries.value, Boolean(slots.trailing))
)
</script>

<style scoped>
.sidebar-chrome {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  min-height: 32px;
  box-sizing: border-box;
  padding: 2px 2px 6px;
  background: transparent;
}

.sidebar-chrome-strip {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
}

.sidebar-chrome-trailing {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
</style>
