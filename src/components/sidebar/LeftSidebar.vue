<template>
  <div class="flex flex-col h-full overflow-hidden bg-[var(--bg-secondary)]">
    <template v-if="activePanel === 'files'">
      <FileTree
        ref="fileTreeRef"
        :collapsed="false"
        :heading-collapsible="false"
        :heading-label="fileTreeHeadingLabel"
        @file-version-history="$emit('file-version-history', $event)"
        @open-folder="$emit('open-folder')"
        @open-workspace="$emit('open-workspace', $event)"
        @close-folder="$emit('close-folder')"
      />
    </template>

    <template v-else-if="activePanel === 'references'">
      <ReferenceList
        :collapsed="false"
        :heading-collapsible="false"
        :heading-label="referencesHeadingLabel"
      />
    </template>

    <div v-else class="flex flex-col h-full overflow-hidden">
      <div
        class="flex items-center h-7 shrink-0 px-2 select-none border-b"
        :style="{ color: 'var(--fg-muted)', borderColor: 'var(--border)' }"
      >
        <span class="ui-text-xs font-medium uppercase tracking-wider">{{ t('Outline') }}</span>
      </div>
      <div class="flex-1 min-h-0">
        <OutlinePanel embedded />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, defineAsyncComponent, computed, nextTick } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import FileTree from './FileTree.vue'

const ReferenceList = defineAsyncComponent(() => import('./ReferenceList.vue'))
const OutlinePanel = defineAsyncComponent(() => import('../panel/OutlinePanel.vue'))

const emit = defineEmits(['file-version-history', 'open-folder', 'open-workspace', 'close-folder'])

const workspace = useWorkspaceStore()
const { t } = useI18n()
const fileTreeRef = ref(null)
const activePanel = computed(() => workspace.leftSidebarPanel || 'files')

const fileTreeHeadingLabel = computed(() => (
  workspace.primarySurface === 'workspace' ? '' : t('Project files')
))
const referencesHeadingLabel = computed(() => (
  workspace.primarySurface === 'workspace' ? t('References') : t('Project references')
))

async function focusFileTree(method, ...args) {
  if (workspace.leftSidebarPanel !== 'files') {
    workspace.setLeftSidebarPanel('files')
    await nextTick()
  }
  fileTreeRef.value?.[method]?.(...args)
}

// Expose FileTree methods for App.vue
defineExpose({
  async createNewFile(ext = '.md') {
    await focusFileTree('createNewFile', ext)
  },
  async activateFilter() {
    await focusFileTree('activateFilter')
  },
})
</script>
