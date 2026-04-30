<template>
  <div class="left-shell-sidebar">
    <template v-if="workspace.leftSidebarPanel === 'files'">
      <div class="left-shell-sidebar__switcher" role="tablist" :aria-label="t('Document sidebar')">
        <UiButton
          class="left-shell-sidebar__switcher-button"
          variant="ghost"
          size="sm"
          :active="documentSidebarMode === 'files'"
          :title="t('Files')"
          :aria-label="t('Files')"
          role="tab"
          :aria-selected="documentSidebarMode === 'files'"
          @click="documentSidebarMode = 'files'"
        >
          {{ t('Files') }}
        </UiButton>
        <UiButton
          class="left-shell-sidebar__switcher-button"
          variant="ghost"
          size="sm"
          :active="documentSidebarMode === 'outline'"
          :title="t('Contents')"
          :aria-label="t('Contents')"
          role="tab"
          :aria-selected="documentSidebarMode === 'outline'"
          @click="documentSidebarMode = 'outline'"
        >
          {{ t('Contents') }}
        </UiButton>
      </div>

      <div class="left-shell-sidebar__content">
        <FileTree
          v-show="documentSidebarMode === 'files'"
          ref="fileTreeRef"
          :collapsed="false"
          :embedded="true"
          :heading-collapsible="false"
          :heading-label="fileTreeHeadingLabel"
          @open-settings="$emit('open-settings')"
          @open-folder="$emit('open-folder')"
          @open-workspace="$emit('open-workspace', $event)"
          @close-folder="$emit('close-folder')"
        />
        <OutlinePanel
          v-show="documentSidebarMode === 'outline'"
          embedded
          :overrideActiveFile="documentTab"
          class="left-shell-sidebar__outline"
        />
      </div>
    </template>

    <ReferencesSidebarPanel
      v-else-if="workspace.leftSidebarPanel === 'references'"
      @open-settings="$emit('open-settings')"
    />
    <ExtensionSidebarPanel
      v-else-if="activeExtensionContainer"
      :container="activeExtensionContainer"
      :context="extensionContext"
      :target="extensionTarget"
    />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useEditorStore } from '../../stores/editor'
import { useReferencesStore } from '../../stores/references'
import { useExtensionsStore } from '../../stores/extensions'
import { useI18n } from '../../i18n'
import { isNewTab } from '../../utils/fileTypes'
import { buildExtensionContext } from '../../domains/extensions/extensionContext.js'
import FileTree from './FileTree.vue'
import ReferencesSidebarPanel from './ReferencesSidebarPanel.vue'
import OutlinePanel from '../panel/OutlinePanel.vue'
import ExtensionSidebarPanel from '../extensions/ExtensionSidebarPanel.vue'
import UiButton from '../shared/ui/UiButton.vue'

defineEmits([
  'open-settings',
  'open-folder',
  'open-workspace',
  'close-folder',
])

const workspace = useWorkspaceStore()
const editorStore = useEditorStore()
const referencesStore = useReferencesStore()
const extensionsStore = useExtensionsStore()
const { t } = useI18n()
const fileTreeRef = ref(null)
const documentSidebarMode = ref('files')
const lastDocumentTab = ref(null)
const fileTreeHeadingLabel = computed(() => '')
const activeExtensionContainer = computed(() =>
  extensionsStore.sidebarViewContainers.find(
    (container) => container.panelId === workspace.leftSidebarPanel
  ) || null
)
const documentTab = computed(() => {
  const active = editorStore.activeTab
  if (active && !isNewTab(active)) {
    return active
  }
  return lastDocumentTab.value
})
const extensionTarget = computed(() => {
  if (workspace.leftSidebarPanel === 'references' && referencesStore.selectedReference?.pdfPath) {
    return {
      kind: 'referencePdf',
      referenceId: String(referencesStore.selectedReference.id || ''),
      path: String(referencesStore.selectedReference.pdfPath || ''),
    }
  }
  const activePath = editorStore.activeTab || ''
  return {
    kind: activePath.toLowerCase().endsWith('.pdf') ? 'pdf' : 'workspace',
    referenceId: '',
    path: activePath,
  }
})
const extensionContext = computed(() =>
  buildExtensionContext(extensionTarget.value, {
    workbench: {
      surface: workspace.isSettingsSurface ? 'settings' : 'workspace',
      panel: workspace.leftSidebarPanel || '',
      activeView: workspace.leftSidebarPanel || 'files',
      hasWorkspace: workspace.isOpen,
      workspaceFolder: workspace.path || '',
    },
  })
)

watch(
  () => editorStore.activeTab,
  (tab) => {
    if (tab && !isNewTab(tab)) {
      lastDocumentTab.value = tab
    }
  },
  { flush: 'post', immediate: true }
)

async function focusFileTree(method, ...args) {
  if (!workspace.isWorkspaceSurface) {
    workspace.openWorkspaceSurface()
    await nextTick()
  }
  if (workspace.leftSidebarPanel !== 'files') {
    workspace.setLeftSidebarPanel('files')
    await nextTick()
  }
  documentSidebarMode.value = 'files'
  await nextTick()
  fileTreeRef.value?.[method]?.(...args)
}

function collapseSidebarFolders() {
  fileTreeRef.value?.collapseAllFolders?.()
}

function openSidebarCreateMenu(anchorEl = null) {
  documentSidebarMode.value = 'files'
  fileTreeRef.value?.toggleCreateMenuFrom?.(anchorEl)
}

// Expose FileTree methods for App.vue
defineExpose({
  async beginNewFile(ext = '.md') {
    await focusFileTree('beginNewFile', ext)
  },
  async createNewFile(ext = '.md') {
    await focusFileTree('createNewFile', ext)
  },
  collapseAllFolders() {
    collapseSidebarFolders()
  },
  openCreateMenuFrom(anchorEl = null) {
    openSidebarCreateMenu(anchorEl)
  },
})
</script>

<style scoped>
.left-shell-sidebar {
  --sidebar-shell-top: 44px;
  --sidebar-shell-inline: 12px;
  --sidebar-shell-bottom: 2px;
  display: flex;
  flex-direction: column;
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  gap: 8px;
  padding: var(--sidebar-shell-top) var(--sidebar-shell-inline) var(--sidebar-shell-bottom);
  background: var(
    --sidebar-shell-surface,
    color-mix(in srgb, var(--panel-surface) 56%, transparent)
  );
  box-shadow: none;
  backdrop-filter: blur(var(--sidebar-shell-blur, 18px))
    saturate(var(--sidebar-shell-saturate, 1.08));
}

.left-shell-sidebar__content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.left-shell-sidebar__content > * {
  flex: 1 1 auto;
  min-height: 0;
}

.left-shell-sidebar__switcher {
  display: inline-flex;
  align-items: center;
  align-self: stretch;
  flex: 0 0 auto;
  gap: 2px;
  margin: 0 4px;
  padding: 1px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--sidebar-item-hover) 72%, transparent);
}

.left-shell-sidebar__switcher-button {
  flex: 1 1 0;
  width: auto;
  height: 22px;
  min-height: 22px;
  border-radius: 6px;
  color: color-mix(in srgb, var(--text-secondary) 84%, transparent);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1;
  text-align: center;
}

.left-shell-sidebar__switcher-button:hover:not(:disabled) {
  background: var(--sidebar-item-hover);
  color: var(--text-primary);
}

.left-shell-sidebar__switcher-button.is-active {
  background: var(--list-active-bg);
  color: var(--text-primary);
}

.left-shell-sidebar__outline {
  flex: 1 1 auto;
  min-height: 0;
}

.left-shell-sidebar__content :deep(.file-tree-scroll) {
  padding-top: 0;
}
</style>
