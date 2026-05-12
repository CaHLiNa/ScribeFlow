<template>
  <div class="file-tree-shell flex flex-col flex-1 min-h-0 h-full">
    <FileTreeHeader
      v-if="!props.embedded"
      :collapsed="collapsed"
      :embedded="props.embedded"
      :heading-collapsible="headingCollapsible"
      :heading-label="headingLabel"
      :workspace-name="workspaceName"
      @collapse-all="collapseAllFolders"
      @toggle-collapse="emit('toggle-collapse')"
      @toggle-new-menu="toggleNewMenu"
    />

    <template v-if="!collapsed">
      <div class="file-tree-body">
        <!-- Tree -->
        <div
          ref="treeContainer"
          class="file-tree-scroll outline-none"
          tabindex="0"
          @contextmenu.prevent="showContextMenuOnEmpty"
          @keydown="handleTreeKeydown"
          @mouseup="onTreeMouseUp"
          @scroll="onTreeScroll"
        >
          <!-- Inline input for new file at root level -->
          <div
            v-if="renaming.active && renaming.isNew && renaming.parentDir === workspace.path"
            class="file-tree-root-rename-row flex items-center py-0.5 px-1"
          >
            <UiInput
              ref="renameInput"
              v-model="renaming.value"
              size="sm"
              shell-class="file-tree-rename-input"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              @keydown.enter.stop="finishRename"
              @keydown.escape.stop="cancelRename"
              @blur="finishRename"
            />
          </div>

          <div
            v-if="visibleRows.length > 0"
            class="relative"
            :style="{ height: totalTreeHeight + 'px' }"
          >
            <div :style="{ transform: `translateY(${virtualOffset}px)` }">
              <FileTreeItem
                v-for="row in virtualRows"
                :key="row.entry.path"
                :entry="row.entry"
                :depth="row.depth"
                :renamingPath="renaming.active && !renaming.isNew ? renaming.originalPath : null"
                :newItemParent="renaming.active && renaming.isNew ? renaming.parentDir : null"
                :newItemValue="renaming.value"
                :newItemIsDir="renaming.isDir"
                :selectedPaths="selectedPaths"
                :dragOverDir="dragOverDir"
                :suppressChildren="true"
                @open-file="openFile"
                @select-file="onSelectFile"
                @context-menu="showContextMenu"
                @start-rename-input="onStartRenameInput"
                @rename-input-change="(v) => (renaming.value = v)"
                @rename-input-submit="finishRename"
                @rename-input-cancel="cancelRename"
                @drag-start="onDragStart"
                @drag-over-dir="(dir) => (dragOverDir = dir)"
                @drag-leave-dir="onDragLeaveDir"
                @drop-on-dir="onDropOnDir"
              />
            </div>
          </div>

          <!-- External drop zone indicator (root level) -->
          <div
            v-if="externalDragOver"
            class="file-tree-drop-indicator mx-2 my-1 py-2 rounded border-2 border-dashed text-center ui-sidebar-meta"
          >
            {{ t('Drop files here') }}
          </div>

          <div
            v-if="visibleRows.length === 0 && !renaming.active"
            class="file-tree-empty-state px-3 py-4 ui-sidebar-empty"
          >
            {{ t('No files yet') }}
          </div>
        </div>
      </div>

      <FileTreeFooter
        @open-folder="emit('open-folder')"
        @open-settings="emit('open-settings')"
        @toggle-workspace-menu="toggleWorkspaceMenu"
      />

      <!-- Context menu -->
      <ContextMenu
        v-if="contextMenu.show"
        :x="contextMenu.x"
        :y="contextMenu.y"
        :entry="contextMenu.entry"
        :selectedCount="selectedPaths.size"
        @close="contextMenu.show = false"
        @create="handleContextCreate"
        @rename="handleRename"
        @duplicate="handleDuplicate"
        @delete="handleDelete"
        @delete-selected="handleDeleteSelected"
        @reveal-in-finder="revealInFinder"
        @open-in-document-dock="openInDocumentDock"
      />

      <!-- Workspace dropdown menu -->
      <FileTreeWorkspaceMenu
        ref="workspaceMenuComponent"
        :open="workspaceMenuOpen"
        :menu-style="workspaceMenuStyle"
        :recent-workspaces="recentWorkspaces"
        @open-folder="handleWorkspaceMenuOpenFolder"
        @open-settings="handleWorkspaceMenuOpenSettings"
        @open-recent="handleWorkspaceMenuOpenRecent"
        @close-folder="handleWorkspaceMenuCloseFolder"
      />

      <!-- "+ New" dropdown menu -->
      <FileTreeNewMenu
        ref="newMenuComponent"
        :open="newMenuOpen"
        :menu-style="newMenuStyle"
        :document-templates="documentTemplates"
        @close="closeNewMenu"
        @create="handleNewMenuCreate"
      />

      <!-- Drag ghost -->
      <Teleport to="body">
        <div
          v-if="dragGhostVisible"
          class="tab-ghost"
          :style="{ left: dragGhostX + 'px', top: dragGhostY + 'px' }"
        >
          {{ dragGhostLabel }}
        </div>
      </Teleport>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick, watch, onBeforeUnmount } from 'vue'
import { basenamePath, dirnamePath } from '../../utils/path'
import { useFilesStore } from '../../stores/files'
import { useEditorStore } from '../../stores/editor'
import { useWorkspaceStore } from '../../stores/workspace'
import { DOCUMENT_DOCK_FILE_PAGE } from '../../domains/editor/documentDockPages.js'
import { listWorkspaceFlatFileEntries } from '../../domains/files/workspaceSnapshotFlatFilesRuntime.js'
import { listWorkspaceDocumentTemplates } from '../../domains/workspace/workspaceTemplateRuntime'
import FileTreeFooter from './FileTreeFooter.vue'
import FileTreeHeader from './FileTreeHeader.vue'
import FileTreeItem from './FileTreeItem.vue'
import FileTreeNewMenu from './FileTreeNewMenu.vue'
import FileTreeWorkspaceMenu from './FileTreeWorkspaceMenu.vue'
import { isMod } from '../../platform'
import ContextMenu from './ContextMenu.vue'
import UiInput from '../shared/ui/UiInput.vue'
import { useI18n } from '../../i18n'
import { revealPathInFileManager } from '../../services/fileTreeSystem'
import { workspacePathExists } from '../../services/pathStatus.js'
import { askNativeDialog } from '../../services/nativeDialog.js'
import { useFileTreeRows } from '../../composables/useFileTreeRows'
import { useFileTreeDrag } from '../../composables/useFileTreeDrag'
import { useTransientOverlayDismiss } from '../../composables/useTransientOverlayDismiss'
import { resolveFloatingReference } from '../../utils/floatingReference'
import { useBasename } from '../../composables/useFileMetadata'

const props = defineProps({
  collapsed: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
  headingCollapsible: { type: Boolean, default: true },
  headingLabel: { type: String, default: '' },
})
const emit = defineEmits([
  'open-settings',
  'toggle-collapse',
  'open-folder',
  'open-workspace',
  'close-folder',
])

const files = useFilesStore()
const editor = useEditorStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()
const documentTemplates = computed(() => listWorkspaceDocumentTemplates(t))

const workspacePathRef = computed(() => workspace.path || '')
const workspaceBasename = useBasename(workspacePathRef)
const workspaceName = computed(() => {
  if (!workspace.path) return t('Explorer')
  return workspaceBasename.value || t('Explorer')
})
const recentWorkspaces = computed(() => workspace.recentWorkspaces.slice(0, 5))
const workspaceSnapshot = computed(
  () => files.lastWorkspaceSnapshot || { flatFiles: files.flatFiles }
)
const workspaceFlatFiles = computed(() => listWorkspaceFlatFileEntries(workspaceSnapshot.value))
const fileTreeDisplayEntries = computed(() => files.fileTreeDisplayEntries)

watch(
  () => workspace.fileTreeShowHidden,
  () => {
    if (!workspace.path) return
    void files.loadFileTree({ suppressErrors: true, keepCurrentTreeOnError: true })
  }
)

watch(
  () => [workspace.fileTreeSortMode, workspace.fileTreeFoldDirectories],
  () => {
    if (!workspace.path) return
    void files.refreshFileTreeDisplayState().catch(() => {})
  }
)

const treeContainer = ref(null)
const renameInput = ref(null)
const workspaceMenuAnchorEl = ref(null)
const workspaceMenuComponent = ref(null)
const newMenuComponent = ref(null)
const newMenuAnchorOverride = ref(null)
const workspaceMenuOpen = ref(false)
const newMenuOpen = ref(false)
const workspaceMenuPosition = reactive({ right: 8, bottom: 8 })
const contextMenu = reactive({ show: false, x: 0, y: 0, entry: null })
const { dismissOtherTransientOverlays } = useTransientOverlayDismiss('file-tree-menu', () => {
  closeWorkspaceMenu()
  closeNewMenu()
  contextMenu.show = false
})

const renaming = reactive({
  active: false,
  value: '',
  originalPath: '',
  isNew: false,
  isDir: false,
  autoExtension: '', // e.g. '.md', '.tex' — auto-appended if user omits extension
  parentDir: '',
})

const {
  visibleRows,
  virtualRows,
  virtualOffset,
  totalTreeHeight,
  selectedPaths,
  onTreeScroll,
  onSelectFile,
  findEntry,
  getActivePath,
  handleTreeKeydown: rawHandleTreeKeydown,
} = useFileTreeRows({
  files,
  editor,
  workspace,
  treeContainer,
  isMod,
  getDisplayTree: () => fileTreeDisplayEntries.value,
})

const {
  dragGhostVisible,
  dragGhostX,
  dragGhostY,
  dragGhostLabel,
  dragOverDir,
  externalDragOver,
  onDragStart,
  onDragLeaveDir,
  onDropOnDir,
  onTreeMouseUp,
} = useFileTreeDrag({
  files,
  editor,
  workspace,
  treeContainer,
  selectedPaths,
})

function openFile(path) {
  workspace.openWorkspaceSurface()
  editor.openFile(path)
}

function openInDocumentDock(entry) {
  if (!entry?.path || entry.is_dir) return
  workspace.openWorkspaceSurface()
  workspace.openDocumentDock()
  workspace.setDocumentDockActivePage(DOCUMENT_DOCK_FILE_PAGE)
  editor.openDocumentDockFile(entry.path)
}

async function handleTreeKeydown(e) {
  if (renaming.active) return
  await rawHandleTreeKeydown(e)
  if (e.__fileTreeRenameEntry) {
    handleRename(e.__fileTreeRenameEntry)
  }
  if (e.__fileTreeDeleteSelected) {
    await handleDeleteSelected()
  }
}

function showContextMenu({ event, entry }) {
  dismissOtherTransientOverlays()
  closeWorkspaceMenu()
  closeNewMenu()
  contextMenu.show = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.entry = entry
}

function showContextMenuOnEmpty(event) {
  if (event.target.closest('.group, .tree-item')) return
  dismissOtherTransientOverlays()
  closeWorkspaceMenu()
  closeNewMenu()
  contextMenu.show = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.entry = null
}

const workspaceMenuReference = computed(() => resolveFloatingReference(workspaceMenuAnchorEl.value))
const workspaceMenuStyle = computed(() => ({
  right: `${workspaceMenuPosition.right}px`,
  bottom: `${workspaceMenuPosition.bottom}px`,
}))

function toggleWorkspaceMenu(anchorEl = null) {
  if (anchorEl) {
    workspaceMenuAnchorEl.value = anchorEl
  }
  const nextOpen = !workspaceMenuOpen.value
  if (nextOpen) {
    dismissOtherTransientOverlays()
    closeNewMenu()
  }
  workspaceMenuOpen.value = nextOpen
}

const newMenuStyle = ref({ top: '0px', left: '0px' })

async function calculateNewMenuPosition(anchor) {
  if (!anchor) return
  await nextTick()
  const menuEl = newMenuComponent.value?.menuEl
  if (!menuEl) return

  const rect = anchor.getBoundingClientRect()
  const menuRect = menuEl.getBoundingClientRect()
  const vh = window.innerHeight || document.documentElement.clientHeight

  let top = rect.bottom + 4
  let left = rect.left

  if (top + menuRect.height > vh) {
    top = Math.max(8, rect.top - menuRect.height - 4)
  }

  newMenuStyle.value = { top: `${top}px`, left: `${left}px` }
}

function toggleNewMenu(anchorEl = null) {
  workspaceMenuOpen.value = false
  newMenuAnchorOverride.value = anchorEl
  const nextOpen = !newMenuOpen.value
  newMenuOpen.value = nextOpen
  if (nextOpen) {
    dismissOtherTransientOverlays()
    calculateNewMenuPosition(anchorEl)
  } else {
    newMenuAnchorOverride.value = null
  }
}

function collapseAllFolders() {
  files.expandedDirs.clear()
}

function closeWorkspaceMenu() {
  workspaceMenuOpen.value = false
}

function closeNewMenu() {
  newMenuOpen.value = false
  newMenuAnchorOverride.value = null
}

function updateWorkspaceMenuPosition() {
  const anchor = workspaceMenuReference.value
  if (!anchor?.getBoundingClientRect) return

  const rect = anchor.getBoundingClientRect()
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0

  workspaceMenuPosition.right = Math.max(8, viewportWidth - rect.right)
  workspaceMenuPosition.bottom = Math.max(8, viewportHeight - rect.top + 2)
}

function handleWorkspaceMenuDocumentPointerDown(event) {
  const target = event.target
  if (!(target instanceof Node)) return

  const anchor = workspaceMenuReference.value
  if (workspaceMenuComponent.value?.menuEl?.contains(target) || anchor?.contains?.(target)) return

  closeWorkspaceMenu()
}

function handleWorkspaceMenuEscape(event) {
  if (event.key !== 'Escape') return
  closeWorkspaceMenu()
}

function handleWorkspaceMenuOpenFolder() {
  closeWorkspaceMenu()
  emit('open-folder')
}

function handleWorkspaceMenuOpenSettings() {
  closeWorkspaceMenu()
  emit('open-settings')
}

function handleWorkspaceMenuOpenRecent(path) {
  closeWorkspaceMenu()
  emit('open-workspace', path)
}

function handleWorkspaceMenuCloseFolder() {
  closeWorkspaceMenu()
  emit('close-folder')
}

watch(workspaceMenuOpen, async (open) => {
  if (open) {
    await nextTick()
    updateWorkspaceMenuPosition()
    window.addEventListener('resize', updateWorkspaceMenuPosition)
    document.addEventListener('pointerdown', handleWorkspaceMenuDocumentPointerDown, true)
    document.addEventListener('keydown', handleWorkspaceMenuEscape, true)
    return
  }

  window.removeEventListener('resize', updateWorkspaceMenuPosition)
  document.removeEventListener('pointerdown', handleWorkspaceMenuDocumentPointerDown, true)
  document.removeEventListener('keydown', handleWorkspaceMenuEscape, true)
})

watch(
  () => workspace.fileTreeShowHidden,
  () => {
    void files.refreshVisibleTree({ suppressErrors: true, reason: 'settings:file-tree-hidden' })
  }
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateWorkspaceMenuPosition)
  document.removeEventListener('pointerdown', handleWorkspaceMenuDocumentPointerDown, true)
  document.removeEventListener('keydown', handleWorkspaceMenuEscape, true)
})

// Unified creation handler — creates a typed file and starts inline rename
async function createTypedFile(dir, ext, options = {}) {
  if (!dir) return

  // Ensure the target directory is expanded so the new file is visible
  if (dir !== workspace.path) {
    files.expandedDirs.add(dir)
  }

  const preferredName =
    typeof options.suggestedName === 'string' && options.suggestedName.trim()
      ? options.suggestedName.trim()
      : `${t('Untitled')}${ext}`
  const normalizedName = preferredName.endsWith(ext) ? preferredName : `${preferredName}${ext}`
  const baseName = normalizedName.endsWith(ext)
    ? normalizedName.slice(0, normalizedName.length - ext.length)
    : normalizedName
  let name = `${baseName}${ext}`
  let i = 2
  while (
    workspaceFlatFiles.value.some((f) => f.name === name) ||
    (await workspacePathExists(`${dir}/${name}`))
  ) {
    name = `${baseName} ${i}${ext}`
    i++
  }

  const path = await files.createFile(dir, name, {
    initialContent: typeof options.initialContent === 'string' ? options.initialContent : '',
  })
  if (path) {
    files.markTransientFile(path)
    workspace.openWorkspaceSurface()
    editor.openFile(path)
    // Wait for Vue to render the new FileTreeItem before starting rename
    await nextTick()
    handleRename({ name, path })
    // Store auto-extension so finishRename can re-append if user removes it
    renaming.autoExtension = ext
  }
}

// Handle "+ New" header dropdown selection (target: workspace root)
function handleNewMenuCreate({ ext, isDir, suggestedName = '', initialContent = '' }) {
  closeNewMenu()
  const dir = workspace.path
  if (!dir) return

  if (isDir) {
    startInlineCreate(dir, true)
  } else if (!ext) {
    // "Other..." — generic inline create
    startInlineCreate(dir, false)
  } else {
    createTypedFile(dir, ext, { suggestedName, initialContent })
  }
}

// Handle context menu creation (target: clicked folder or workspace root)
function handleContextCreate({ ext, isDir, suggestedName = '', initialContent = '' }) {
  const dir = contextMenu.entry?.is_dir ? contextMenu.entry.path : workspace.path
  if (!dir) return

  if (isDir) {
    startInlineCreate(dir, true)
  } else if (!ext) {
    startInlineCreate(dir, false)
  } else {
    createTypedFile(dir, ext, { suggestedName, initialContent })
  }
}

// Duplicate a file or folder
async function handleDuplicate(entry) {
  const newPath = await files.duplicatePath(entry.path)
  if (newPath) {
    const newName = basenamePath(newPath)
    if (!entry.is_dir) {
      workspace.openWorkspaceSurface()
      editor.openFile(newPath)
    }
    // Start inline rename so user can give it a proper name
    handleRename({ name: newName, path: newPath })
  }
}

function startInlineCreate(dir, isDir) {
  if (dir !== workspace.path) {
    files.expandedDirs.add(dir)
  }

  renaming.active = true
  renaming.isNew = true
  renaming.isDir = isDir
  renaming.autoExtension = ''
  renaming.parentDir = dir
  renaming.value = isDir ? t('new-folder') : ''
  renaming.originalPath = ''

  nextTick(() => {
    if (dir === workspace.path && renameInput.value) {
      renameInput.value.select()
    }
  })
}

function startInlineTypedFileCreate(dir, ext = '.md') {
  startInlineCreate(dir, false)
  renaming.autoExtension = ext
}

function handleRename(entry) {
  renaming.active = true
  renaming.isNew = false
  renaming.autoExtension = ''
  renaming.value = entry.name
  renaming.originalPath = entry.path
  renaming.parentDir = ''
}

function onStartRenameInput() {
  // Called by FileTreeItem when the inline input is mounted
}

let isFinishing = false
async function finishRename() {
  if (!renaming.active || isFinishing) return
  isFinishing = true

  try {
    let name = renaming.value.trim()
    if (!name) {
      return
    }

    if (renaming.isNew) {
      // Auto-append extension if user omits it (for typed file creation)
      if (renaming.autoExtension && !name.includes('.')) {
        name = name + renaming.autoExtension
      }

      if (renaming.isDir) {
        await files.createFolder(renaming.parentDir, name)
      } else {
        const path = await files.createFile(renaming.parentDir, name)
        if (path) {
          files.markTransientFile(path)
          workspace.openWorkspaceSurface()
          editor.openFile(path)
        }
      }
    } else if (renaming.originalPath) {
      // Auto-append extension if user omits it (for typed file rename after creation)
      if (renaming.autoExtension && !name.includes('.')) {
        name = name + renaming.autoExtension
      }
      const dir = dirnamePath(renaming.originalPath)
      const newPath = `${dir}/${name}`
      if (newPath !== renaming.originalPath) {
        await files.renamePath(renaming.originalPath, newPath)
      }
    }
  } catch (e) {
    console.error('Rename failed:', e)
  } finally {
    cancelRename()
    isFinishing = false
  }
}

function cancelRename() {
  renaming.active = false
  renaming.value = ''
  renaming.originalPath = ''
}

async function handleDelete(entry) {
  const yes = await askNativeDialog(t('Delete "{name}"?', { name: entry.name }), {
    title: t('Confirm Delete'),
    kind: 'warning',
  })
  if (yes) {
    await files.deletePath(entry.path)
  }
}

async function handleDeleteSelected() {
  const paths = [...selectedPaths]
  if (paths.length === 0) return
  const msg =
    paths.length === 1
      ? t('Delete "{name}"?', { name: basenamePath(paths[0]) })
      : t('Delete {count} items?', { count: paths.length })
  const yes = await askNativeDialog(msg, { title: t('Confirm Delete'), kind: 'warning' })
  if (yes) {
    for (const path of paths) {
      await files.deletePath(path)
    }
    selectedPaths.clear()
  }
}

async function revealInFinder(entry) {
  try {
    await revealPathInFileManager(entry)
  } catch (e) {
    console.error('Failed to reveal in file manager:', e)
  }
}

defineExpose({
  async beginNewFile(ext = '.md') {
    let targetDir = workspace.path

    if (selectedPaths.size > 0) {
      const selectedPath = getActivePath()
      const entry = findEntry(selectedPath)
      if (entry) {
        if (entry.is_dir) {
          targetDir = entry.path
          files.expandedDirs.add(targetDir)
        } else {
          targetDir = dirnamePath(selectedPath)
        }
      }
    }

    startInlineTypedFileCreate(targetDir, ext)
  },
  collapseAllFolders,
  toggleCreateMenuFrom(anchorEl = null) {
    toggleNewMenu(anchorEl)
  },
  async createNewFile(ext = '.md') {
    let targetDir = workspace.path

    if (selectedPaths.size > 0) {
      const selectedPath = getActivePath()
      const entry = findEntry(selectedPath)
      if (entry) {
        if (entry.is_dir) {
          targetDir = entry.path
          files.expandedDirs.add(targetDir)
        } else {
          targetDir = dirnamePath(selectedPath)
        }
      }
    }

    createTypedFile(targetDir, ext)
  },
})
</script>

<style scoped>
.file-tree-shell {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  background: transparent;
}

.file-tree-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.file-tree-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 4px 4px 4px;
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0,
    black 18px,
    black calc(100% - 18px),
    transparent 100%
  );
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    black 18px,
    black calc(100% - 18px),
    transparent 100%
  );
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}

.file-tree-root-rename-row {
  padding-left: 28px;
}

.file-tree-rename-input {
  font-size: var(--sidebar-font-control);
  border-color: color-mix(in srgb, var(--border) 48%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-base) 84%, transparent);
}

.file-tree-drop-indicator {
  border-color: var(--accent);
  color: var(--accent);
  opacity: 0.6;
}

.file-tree-empty-state {
  color: var(--text-muted);
}

</style>
