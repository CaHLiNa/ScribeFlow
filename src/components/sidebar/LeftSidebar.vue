<template>
  <div class="left-shell-sidebar">
    <SidebarChrome :entries="sidebarEntries" active-key="files" @select="selectSidebarPanel">
      <template #trailing>
        <ShellChromeButton
          size="icon-xs"
          :title="t('Collapse All Folders')"
          :aria-label="t('Collapse All Folders')"
          @click="collapseSidebarFolders"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path
              d="M14 4.27c.6.35 1 .99 1 1.73v5c0 2.21-1.79 4-4 4H6c-.74 0-1.38-.4-1.73-1H11c1.65 0 3-1.35 3-3zM9.5 7a.5.5 0 0 1 0 1h-4a.5.5 0 0 1 0-1z"
            />
            <path
              fill-rule="evenodd"
              d="M11 2c1.103 0 2 .897 2 2v7c0 1.103-.897 2-2 2H4c-1.103 0-2-.897-2-2V4c0-1.103.897-2 2-2zM4 3c-.551 0-1 .449-1 1v7c0 .552.449 1 1 1h7c.551 0 1-.448 1-1V4c0-.551-.449-1-1-1z"
              clip-rule="evenodd"
            />
          </svg>
        </ShellChromeButton>
        <ShellChromeButton
          size="icon-xs"
          :title="t('New File or Folder')"
          :aria-label="t('New File or Folder')"
          @click="openSidebarCreateMenu"
        >
          <IconPlus :size="10" :stroke-width="1.9" />
        </ShellChromeButton>
      </template>
    </SidebarChrome>

    <FileTree
      ref="activeSidebarRef"
      :collapsed="false"
      :embedded="true"
      :heading-collapsible="false"
      :heading-label="fileTreeHeadingLabel"
      @file-version-history="$emit('file-version-history', $event)"
      @open-folder="$emit('open-folder')"
      @open-workspace="$emit('open-workspace', $event)"
      @close-folder="$emit('close-folder')"
    />
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { IconPlus } from '@tabler/icons-vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import { getWorkbenchSidebarChromeEntries } from '../../shared/workbenchChromeEntries'
import FileTree from './FileTree.vue'
import SidebarChrome from '../shared/SidebarChrome.vue'
import ShellChromeButton from '../shared/ShellChromeButton.vue'

defineEmits(['file-version-history', 'open-folder', 'open-workspace', 'close-folder'])

const workspace = useWorkspaceStore()
const { t } = useI18n()
const activeSidebarRef = ref(null)
const sidebarEntries = computed(() => getWorkbenchSidebarChromeEntries(t, workspace.primarySurface))
const fileTreeHeadingLabel = computed(() => '')

async function focusFileTree(method, ...args) {
  if (!workspace.isWorkspaceSurface) {
    workspace.openWorkspaceSurface()
    await nextTick()
  }
  activeSidebarRef.value?.[method]?.(...args)
}

function selectSidebarPanel(panel) {
  workspace.setLeftSidebarPanel(panel)
}

function actionAnchor(event) {
  return event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
}

function collapseSidebarFolders() {
  activeSidebarRef.value?.collapseAllFolders?.()
}

function openSidebarCreateMenu(event) {
  activeSidebarRef.value?.toggleCreateMenuFrom?.(actionAnchor(event))
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

<style scoped>
.left-shell-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 4px 8px 8px 2px;
  background: transparent;
}

.left-shell-sidebar > :last-child {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
