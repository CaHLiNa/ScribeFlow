<template>
  <div class="left-shell-sidebar">
    <SidebarChrome :entries="sidebarEntries" :active-key="activePanel" @select="selectSidebarPanel">
      <template #trailing>
        <template v-if="usesFileTreePanel">
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

        <template v-else-if="usesReferencePanel">
          <ShellChromeButton
            size="icon-xs"
            :title="t('Export references')"
            :aria-label="t('Export references')"
            @click="toggleSidebarReferenceExport"
          >
            <svg
              width="9"
              height="9"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              aria-hidden="true"
            >
              <path d="M8 10V2M4 6l4-4 4 4M2 13h12" />
            </svg>
          </ShellChromeButton>
          <ShellChromeButton
            size="icon-xs"
            :title="t('Add reference')"
            :aria-label="t('Add reference')"
            @click="openSidebarAddReferenceDialog"
          >
            <IconPlus :size="10" :stroke-width="1.9" />
          </ShellChromeButton>
          <ShellChromeButton
            size="icon-xs"
            :title="t('Reference maintenance')"
            :aria-label="t('Reference maintenance')"
            @click="openSidebarReferenceMaintenance"
          >
            <IconSparkles :size="10" :stroke-width="1.7" />
          </ShellChromeButton>
        </template>

        <template
          v-else-if="
            workspace.isLibrarySurface &&
            activePanel === 'library-tags' &&
            libraryTagSelectionCount > 0
          "
        >
          <ShellChromeButton
            size="icon-xs"
            :title="t('Clear')"
            :aria-label="t('Clear')"
            @click="clearLibrarySelectedTags"
          >
            <IconX :size="10" :stroke-width="2" />
          </ShellChromeButton>
        </template>
      </template>
    </SidebarChrome>

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
        @tag-selection-change="updateLibraryTagSelectionCount"
      />
    </KeepAlive>
  </div>
</template>

<script setup>
import { ref, defineAsyncComponent, computed, nextTick } from 'vue'
import { IconPlus, IconSparkles, IconX } from '@tabler/icons-vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import { normalizeWorkbenchSidebarPanel } from '../../shared/workbenchSidebarPanels'
import { getWorkbenchSidebarChromeEntries } from '../../shared/workbenchChromeEntries'
import FileTree from './FileTree.vue'
import SidebarChrome from '../shared/SidebarChrome.vue'
import ShellChromeButton from '../shared/ShellChromeButton.vue'

const ReferenceList = defineAsyncComponent(() => import('./ReferenceList.vue'))
const ConversionSidebar = defineAsyncComponent(() => import('./ConversionSidebar.vue'))
const LibrarySidebar = defineAsyncComponent(() => import('./LibrarySidebar.vue'))
const AiWorkbenchSidebar = defineAsyncComponent(() => import('./AiWorkbenchSidebar.vue'))

defineEmits(['file-version-history', 'open-folder', 'open-workspace', 'close-folder'])

const workspace = useWorkspaceStore()
const { t } = useI18n()
const activeSidebarRef = ref(null)
const libraryTagSelectionCount = ref(0)
const activePanel = computed(() =>
  normalizeWorkbenchSidebarPanel(workspace.primarySurface, workspace.leftSidebarPanel)
)
const usesFileTreePanel = computed(
  () => (workspace.isWorkspaceSurface || workspace.isConversionSurface) && activePanel.value === 'files'
)
const usesReferencePanel = computed(
  () => workspace.isWorkspaceSurface && activePanel.value === 'references'
)
const sidebarEntries = computed(() => getWorkbenchSidebarChromeEntries(t, workspace.primarySurface))
const activeSidebarView = computed(() => {
  if (workspace.isConversionSurface) {
    if (activePanel.value === 'files') {
      return {
        component: FileTree,
        key: 'conversion-files',
        props: {
          collapsed: false,
          embedded: true,
          headingCollapsible: false,
          headingLabel: fileTreeHeadingLabel.value,
        },
        className: '',
      }
    }

    return {
      component: ConversionSidebar,
      key: `conversion-${activePanel.value}`,
      props: {
        panel: activePanel.value,
      },
      className: '',
    }
  }

  if (workspace.isWorkspaceSurface && activePanel.value === 'files') {
    return {
      component: FileTree,
      key: 'workspace-files',
      props: {
        collapsed: false,
        embedded: true,
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
        embedded: true,
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

const fileTreeHeadingLabel = computed(() =>
  workspace.primarySurface === 'workspace' ? '' : t('Project files')
)
const referencesHeadingLabel = computed(() =>
  workspace.primarySurface === 'workspace' ? t('References') : t('Project references')
)

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

function toggleSidebarReferenceExport(event) {
  activeSidebarRef.value?.toggleExportMenuFrom?.(actionAnchor(event))
}

function openSidebarAddReferenceDialog() {
  activeSidebarRef.value?.openAddReferenceDialog?.()
}

function openSidebarReferenceMaintenance() {
  activeSidebarRef.value?.openReferenceAi?.()
}

function clearLibrarySelectedTags() {
  activeSidebarRef.value?.clearSelectedTags?.()
}

function updateLibraryTagSelectionCount(count = 0) {
  libraryTagSelectionCount.value = Number.isFinite(count) ? count : 0
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
  background: var(--bg-primary);
}
</style>
