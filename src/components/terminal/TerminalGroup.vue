<template>
  <div class="terminal-group h-full min-h-0 min-w-0" @mousedown="emit('activate-group', group.id)">
    <TerminalSurface
      v-if="group.activeInstanceId"
      :key="group.activeInstanceId"
      ref="surfaceRef"
      :instance-id="group.activeInstanceId"
      @contextmenu="emit('surface-contextmenu', { event: $event, instanceId: group.activeInstanceId })"
    />
    <div v-else class="h-full w-full" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import TerminalSurface from './TerminalSurface.vue'

defineProps({
  group: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['activate-group', 'surface-contextmenu'])
const surfaceRef = ref(null)

defineExpose({
  focusSurface() {
    surfaceRef.value?.focus?.()
  },
  refitSurface() {
    surfaceRef.value?.refitTerminal?.()
  },
  clearSurface() {
    surfaceRef.value?.clear?.()
  },
  searchNext(query, options) {
    return surfaceRef.value?.searchNext?.(query, options)
  },
  searchPrevious(query, options) {
    return surfaceRef.value?.searchPrevious?.(query, options)
  },
  scrollToCommand(direction) {
    return surfaceRef.value?.scrollToCommand?.(direction)
  },
  copySelection() {
    return surfaceRef.value?.copySelection?.()
  },
  paste() {
    return surfaceRef.value?.paste?.()
  },
  selectAll() {
    return surfaceRef.value?.selectAll?.()
  },
})
</script>
