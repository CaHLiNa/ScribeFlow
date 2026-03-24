<template>
  <div class="flex flex-col h-full overflow-hidden bg-[var(--bg-secondary)]">
    <KeepAlive :max="4">
      <component
        :is="activeSidebarView.component"
        ref="activeSidebarRef"
        :key="activeSidebarView.key"
        v-bind="activeSidebarView.props"
        :class="activeSidebarView.className"
        @file-version-history="$emit('file-version-history', $event)"
        @open-folder="$emit('open-folder')"
        @open-workspace="$emit('open-workspace', $event)"
        @close-folder="$emit('close-folder')"
      />
    </KeepAlive>
  </div>
</template>

<script setup>
import { ref, defineAsyncComponent, computed, nextTick, KeepAlive } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import { normalizeWorkbenchSidebarPanel } from '../../shared/workbenchSidebarPanels'
import FileTree from './FileTree.vue'

const ReferenceList = defineAsyncComponent(() => import('./ReferenceList.vue'))
const LibrarySidebar = defineAsyncComponent(() => import('./LibrarySidebar.vue'))
const AiWorkbenchSidebar = defineAsyncComponent(() => import('./AiWorkbenchSidebar.vue'))

const emit = defineEmits(['file-version-history', 'open-folder', 'open-workspace', 'close-folder'])

const workspace = useWorkspaceStore()
const { t } = useI18n()
const activeSidebarRef = ref(null)
const activePanel = computed(() => normalizeWorkbenchSidebarPanel(
  workspace.primarySurface,
  workspace.leftSidebarPanel,
))
const activeSidebarView = computed(() => {
  if (workspace.isWorkspaceSurface && activePanel.value !== 'references') {
    return {
      component: FileTree,
      key: 'workspace-files',
      props: {
        collapsed: false,
        headingCollapsible: false,
        headingLabel: fileTreeHeadingLabel.value,
      },
      className: '',
    }
  }

  if (workspace.isWorkspaceSurface) {
    return {
      component: ReferenceList,
      key: 'workspace-references',
      props: {
        collapsed: false,
        headingCollapsible: false,
        headingLabel: referencesHeadingLabel.value,
      },
      className: '',
    }
  }

  if (workspace.isLibrarySurface) {
    return {
      component: LibrarySidebar,
      key: 'library-sidebar',
      props: {},
      className: '',
    }
  }

  return {
    component: AiWorkbenchSidebar,
    key: 'ai-sidebar',
    props: {},
    className: 'flex-1 min-h-0 overflow-hidden',
  }
})

const fileTreeHeadingLabel = computed(() => (
  workspace.primarySurface === 'workspace' ? '' : t('Project files')
))
const referencesHeadingLabel = computed(() => (
  workspace.primarySurface === 'workspace' ? t('References') : t('Project references')
))

async function focusFileTree(method, ...args) {
  if (!workspace.isWorkspaceSurface) {
    workspace.openWorkspaceSurface()
    await nextTick()
  }
  if (activePanel.value !== 'files') {
    workspace.setLeftSidebarPanel('files')
    await nextTick()
  }
  activeSidebarRef.value?.[method]?.(...args)
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
