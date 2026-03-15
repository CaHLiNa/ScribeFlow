<template>
  <div ref="containerEl" class="flex flex-col h-full overflow-hidden bg-[var(--bg-secondary)]">
    <!-- Explorer section -->
    <div
      class="overflow-hidden"
      :style="explorerStyle"
    >
      <FileTree
        ref="fileTreeRef"
        :collapsed="explorerCollapsed"
        @toggle-collapse="toggleExplorer"
        @version-history="$emit('version-history', $event)"
        @open-folder="$emit('open-folder')"
        @open-workspace="$emit('open-workspace', $event)"
        @close-folder="$emit('close-folder')"
      />
    </div>

    <!-- Resize handle: explorer ↔ refs (when both expanded) -->
    <div
      v-if="showHandleExplorerRefs"
      class="relative h-0.5 shrink-0 cursor-row-resize bg-transparent"
      @mousedown="startResizeRefs"
    >
      <!-- Visual handle, stays at 1px -->
      <div
        class="absolute left-0 right-0 top-0.5 -translate-y-1/2 h-4 w-full z-10"
        
      ></div>
      <!-- Hover indicator remains at 1px high for visual, but you can increase its opacity or style on hover if needed -->
    </div>

    <!-- References section -->
    <div
      class="overflow-hidden relative border-b border-t border-[var(--border)]"
      :style="refsStyle"
    >
      <ReferenceList
        v-if="refsLoaded"
        :collapsed="refsCollapsed"
        @toggle-collapse="toggleRefs"
      />
      <button
        v-else
        type="button"
        class="flex items-center w-full h-7 px-2 gap-1 select-none"
        :style="{ color: 'var(--fg-muted)' }"
        @click="toggleRefs"
      >
        <svg
          width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"
        >
          <path d="M6 4l4 4-4 4"/>
        </svg>
        <span class="ui-text-xs font-medium uppercase tracking-wider">References</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, defineAsyncComponent } from 'vue'
import { useLeftSidebarPanels } from '../../composables/useLeftSidebarPanels'
import FileTree from './FileTree.vue'

const ReferenceList = defineAsyncComponent(() => import('./ReferenceList.vue'))

const emit = defineEmits(['version-history', 'open-folder', 'open-workspace', 'close-folder'])

const containerEl = ref(null)
const fileTreeRef = ref(null)
const {
  explorerCollapsed,
  refsCollapsed,
  refsLoaded,
  explorerStyle,
  refsStyle,
  showHandleExplorerRefs,
  toggleExplorer,
  toggleRefs,
  startResizeRefs,
} = useLeftSidebarPanels(containerEl)

// Expose FileTree methods for App.vue
defineExpose({
  createNewFile(ext = '.md') {
    fileTreeRef.value?.createNewFile(ext)
  },
  activateFilter() {
    fileTreeRef.value?.activateFilter()
  },
})
</script>
