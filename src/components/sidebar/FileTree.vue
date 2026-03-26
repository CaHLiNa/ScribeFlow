<template>
  <div class="file-tree-shell flex flex-col h-full">
    <!-- Header -->
    <div
      v-if="!props.embedded"
      class="file-tree-header flex items-center h-7 shrink-0 px-2 gap-1 select-none"
      :class="{ 'file-tree-header--with-divider': !collapsed && !props.embedded }"
    >
      <div
        class="flex items-center gap-1 min-w-0 flex-1"
        :class="{ 'cursor-pointer': headingCollapsible }"
        @click="headingCollapsible ? $emit('toggle-collapse') : null"
      >
        <svg
          v-if="headingCollapsible"
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          class="file-tree-chevron"
          :class="{ 'file-tree-chevron-open': !collapsed }"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        <span class="ui-sidebar-kicker truncate min-w-0">{{ headingLabel || workspaceName }}</span>
      </div>
      <div v-if="!collapsed" class="flex items-center gap-1 shrink-0">
        <UiButton
          class="w-5 h-5 flex items-center justify-center rounded hover:opacity-80"
          variant="ghost"
          size="icon-xs"
          icon-only
          @click.stop="collapseAllFolders"
          :title="t('Collapse All Folders')"
          :aria-label="t('Collapse All Folders')"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path
              d="M14 4.27c.6.35 1 .99 1 1.73v5c0 2.21-1.79 4-4 4H6c-.74 0-1.38-.4-1.73-1H11c1.65 0 3-1.35 3-3zM9.5 7a.5.5 0 0 1 0 1h-4a.5.5 0 0 1 0-1z"
            />
            <path
              fill-rule="evenodd"
              d="M11 2c1.103 0 2 .897 2 2v7c0 1.103-.897 2-2 2H4c-1.103 0-2-.897-2-2V4c0-1.103.897-2 2-2zM4 3c-.551 0-1 .449-1 1v7c0 .552.449 1 1 1h7c.551 0 1-.448 1-1V4c0-.551-.449-1-1-1z"
              clip-rule="evenodd"
            />
          </svg>
        </UiButton>
        <UiButton
          ref="newBtnEl"
          class="w-5 h-5 flex items-center justify-center rounded hover:opacity-80"
          variant="ghost"
          size="icon-xs"
          icon-only
          @click.stop="toggleNewMenu"
          :title="t('New File or Folder')"
          :aria-label="t('New File or Folder')"
        >
          <IconPlus :size="12" :stroke-width="2" />
        </UiButton>
      </div>
    </div>

    <template v-if="!collapsed">
      <!-- Search input -->
      <div class="px-2 py-0.5 shrink-0">
        <UiInput
          ref="filterInputEl"
          v-model="filterQuery"
          size="sm"
          class="file-tree-search-input"
          :placeholder="t('Filter files...')"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          @keydown="handleFilterKeydown"
        >
          <template #prefix>
            <IconSearch :size="12" :stroke-width="1.5" class="file-tree-search-icon" />
          </template>
        </UiInput>
      </div>

      <!-- Tree -->
      <div
        ref="treeContainer"
        class="flex-1 overflow-y-auto overflow-x-hidden py-0.5 outline-none"
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
              :filterQuery="filterActive ? filterQuery : ''"
              :forceExpand="filterActive && !!filterQuery"
              :filterHighlightPath="filterHighlightPath"
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
          v-if="filterActive && filterQuery && filterMatches.length === 0"
          class="file-tree-empty-state px-3 py-4 ui-sidebar-empty"
        >
          {{ t('No matches') }}
        </div>
        <div
          v-else-if="visibleRows.length === 0 && !renaming.active"
          class="file-tree-empty-state px-3 py-4 ui-sidebar-empty"
        >
          {{ t('No files yet') }}
        </div>
      </div>

      <div class="workspace-footer-action">
        <UiButton
          ref="workspaceMenuAnchorEl"
          class="workspace-footer-action-button"
          variant="ghost"
          size="sm"
          block
          :title="t('Workspace Menu')"
          :aria-label="t('Workspace Menu')"
          @click.stop="toggleWorkspaceMenu"
        >
          {{ t('Open Folder...') }}
          <template #trailing>
            <IconDotsVertical :size="16" :stroke-width="1.7" />
          </template>
        </UiButton>
      </div>

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
        @file-version-history="$emit('file-version-history', $event)"
        @reveal-in-finder="revealInFinder"
        @import-to-refs="handleImportToRefs"
      />

      <!-- Workspace dropdown menu -->
      <Teleport to="body">
        <div v-if="workspaceMenuOpen" class="fixed inset-0 z-50" @click="workspaceMenuOpen = false">
          <div class="context-menu" :style="workspaceMenuStyle">
            <div class="context-menu-item" @click="handleWorkspaceMenuOpenFolder">
              {{ t('Open Folder...') }}
              <span class="context-menu-ext file-tree-workspace-shortcut">{{ modKey }}+O</span>
            </div>
            <template v-if="recentWorkspaces.length">
              <div class="context-menu-separator"></div>
              <div class="context-menu-section">{{ t('Recent') }}</div>
              <div
                v-for="recent in recentWorkspaces"
                :key="recent.path"
                class="context-menu-item"
                @click="handleWorkspaceMenuOpenRecent(recent.path)"
              >
                {{ recent.name }}
              </div>
            </template>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" @click="handleWorkspaceMenuCloseFolder">
              {{ t('Close Folder') }}
            </div>
          </div>
        </div>
      </Teleport>

      <!-- "+ New" dropdown menu -->
      <Teleport to="body">
        <div v-if="newMenuOpen" class="fixed inset-0 z-50" @click="newMenuOpen = false">
          <div class="context-menu" :style="newMenuStyle">
            <div class="context-menu-item" @click="handleNewMenuCreate({ ext: null, isDir: true })">
              <IconFolderPlus :size="14" :stroke-width="1.5" />
              <span class="flex-1">{{ t('New Folder') }}</span>
            </div>
            <div class="context-menu-item" @click="handleNewMenuCreate({ ext: null })">
              <IconFilePlus :size="14" :stroke-width="1.5" />
              <span class="flex-1">{{ t('New File...') }}</span>
            </div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" @click="handleNewMenuCreate({ ext: '.md' })">
              <IconFileText :size="14" :stroke-width="1.5" />
              <span class="flex-1">{{ t('Markdown') }}</span>
              <span class="context-menu-ext">.md</span>
            </div>
            <div class="context-menu-item" @click="handleNewMenuCreate({ ext: '.tex' })">
              <IconMath :size="14" :stroke-width="1.5" />
              <span class="flex-1">{{ t('LaTeX') }}</span>
              <span class="context-menu-ext">.tex</span>
            </div>
            <div class="context-menu-item" @click="handleNewMenuCreate({ ext: '.typ' })">
              <IconMath :size="14" :stroke-width="1.5" />
              <span class="flex-1">Typst</span>
              <span class="context-menu-ext">.typ</span>
            </div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" @click="handleNewMenuCreate({ ext: '.R' })">
              <IconCode :size="14" :stroke-width="1.5" />
              <span class="flex-1">{{ t('R Script') }}</span>
              <span class="context-menu-ext">.R</span>
            </div>
            <div class="context-menu-item" @click="handleNewMenuCreate({ ext: '.py' })">
              <IconBrandPython :size="14" :stroke-width="1.5" />
              <span class="flex-1">{{ t('Python') }}</span>
              <span class="context-menu-ext">.py</span>
            </div>
            <div class="context-menu-item" @click="handleNewMenuCreate({ ext: '.ipynb' })">
              <IconNotebook :size="14" :stroke-width="1.5" />
              <span class="flex-1">{{ t('Notebook') }}</span>
              <span class="context-menu-ext">.ipynb</span>
            </div>
          </div>
        </div>
      </Teleport>

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
import { ref, reactive, computed, nextTick } from 'vue'
import { useFilesStore } from '../../stores/files'
import { useEditorStore } from '../../stores/editor'
import { useWorkspaceStore } from '../../stores/workspace'
import FileTreeItem from './FileTreeItem.vue'
import { isMod, modKey } from '../../platform'
import ContextMenu from './ContextMenu.vue'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'
import {
  IconSearch,
  IconPlus,
  IconFileText,
  IconNotebook,
  IconMath,
  IconCode,
  IconBrandPython,
  IconFilePlus,
  IconFolderPlus,
  IconDotsVertical,
} from '@tabler/icons-vue'
import { ask } from '@tauri-apps/plugin-dialog'
import { useI18n } from '../../i18n'
import { pathExists, revealPathInFileManager } from '../../services/fileTreeSystem'
import { useFileTreeFilter } from '../../composables/useFileTreeFilter'
import { useFileTreeDrag } from '../../composables/useFileTreeDrag'

const props = defineProps({
  collapsed: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
  headingCollapsible: { type: Boolean, default: true },
  headingLabel: { type: String, default: '' },
})
const emit = defineEmits([
  'file-version-history',
  'toggle-collapse',
  'open-folder',
  'open-workspace',
  'close-folder',
])

const files = useFilesStore()
const editor = useEditorStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()

const workspaceName = computed(() => {
  if (!workspace.path) return t('Explorer')
  return workspace.path.split('/').pop()
})
const recentWorkspaces = computed(() => workspace.getRecentWorkspaces().slice(0, 5))

const treeContainer = ref(null)
const renameInput = ref(null)
const filterInputEl = ref(null)
const workspaceMenuAnchorEl = ref(null)
const newBtnEl = ref(null)
const workspaceMenuOpen = ref(false)
const newMenuOpen = ref(false)
const contextMenu = reactive({ show: false, x: 0, y: 0, entry: null })

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
  filterActive,
  filterQuery,
  filterMatches,
  filterHighlightPath,
  visibleRows,
  virtualRows,
  virtualOffset,
  totalTreeHeight,
  selectedPaths,
  onTreeScroll,
  onSelectFile,
  handleFilterKeydown,
  activateFilter,
  findEntry,
  getActivePath,
  handleTreeKeydown: rawHandleTreeKeydown,
} = useFileTreeFilter({
  files,
  editor,
  workspace,
  treeContainer,
  filterInputEl,
  isMod,
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
  isImportableFile,
} = useFileTreeDrag({
  files,
  editor,
  workspace,
  treeContainer,
  selectedPaths,
})

function openFile(path) {
  editor.openFile(path)
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
  contextMenu.show = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.entry = entry
}

function showContextMenuOnEmpty(event) {
  if (event.target.closest('.group, .tree-item')) return
  contextMenu.show = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.entry = null
}

const workspaceMenuStyle = computed(() => {
  if (!workspaceMenuAnchorEl.value) return {}
  const rect = workspaceMenuAnchorEl.value.getBoundingClientRect()
  const menuWidth = Math.max(220, Math.round(rect.width))
  const viewportPadding = 8
  const menuGap = 1
  const maxX = window.innerWidth - menuWidth - viewportPadding
  const bottom = Math.max(viewportPadding, window.innerHeight - rect.top + menuGap)
  const maxHeight = Math.max(120, rect.top - viewportPadding - menuGap)
  return {
    left: Math.min(rect.left, maxX) + 'px',
    top: 'auto',
    bottom: `${bottom}px`,
    minWidth: `${menuWidth}px`,
    maxHeight: `${maxHeight}px`,
    overflowY: 'auto',
  }
})

// Computed style for the "+ New" dropdown (anchored below the button)
const newMenuStyle = computed(() => {
  if (!newBtnEl.value) return {}
  const rect = newBtnEl.value.getBoundingClientRect()
  const menuWidth = 200
  const menuHeight = 320
  const maxX = window.innerWidth - menuWidth - 8
  const maxY = window.innerHeight - menuHeight - 8
  return {
    left: Math.min(rect.left, maxX) + 'px',
    top: Math.min(rect.bottom + 2, maxY) + 'px',
  }
})

function toggleWorkspaceMenu() {
  workspaceMenuOpen.value = !workspaceMenuOpen.value
  if (workspaceMenuOpen.value) {
    newMenuOpen.value = false
  }
}

function toggleNewMenu() {
  workspaceMenuOpen.value = false
  newMenuOpen.value = !newMenuOpen.value
}

function collapseAllFolders() {
  files.expandedDirs.clear()
}

function closeWorkspaceMenu() {
  workspaceMenuOpen.value = false
}

function handleWorkspaceMenuOpenFolder() {
  closeWorkspaceMenu()
  emit('open-folder')
}

function handleWorkspaceMenuOpenRecent(path) {
  closeWorkspaceMenu()
  emit('open-workspace', path)
}

function handleWorkspaceMenuCloseFolder() {
  closeWorkspaceMenu()
  emit('close-folder')
}

// Unified creation handler — creates a typed file and starts inline rename
async function createTypedFile(dir, ext) {
  if (!dir) return

  // Ensure the target directory is expanded so the new file is visible
  if (dir !== workspace.path) {
    files.expandedDirs.add(dir)
  }

  // Generate unique default name — check both in-memory list and disk
  const baseName = t('Untitled')
  let name = `${baseName}${ext}`
  let i = 2
  while (files.flatFiles.some((f) => f.name === name) || (await pathExists(`${dir}/${name}`))) {
    name = `${baseName} ${i}${ext}`
    i++
  }

  const path = await files.createFile(dir, name)
  if (path) {
    editor.openFile(path)
    // Wait for Vue to render the new FileTreeItem before starting rename
    await nextTick()
    handleRename({ name, path })
    // Store auto-extension so finishRename can re-append if user removes it
    renaming.autoExtension = ext
  }
}

// Handle "+ New" header dropdown selection (target: workspace root)
function handleNewMenuCreate({ ext, isDir }) {
  newMenuOpen.value = false
  const dir = workspace.path
  if (!dir) return

  if (isDir) {
    startInlineCreate(dir, true)
  } else if (!ext) {
    // "Other..." — generic inline create
    startInlineCreate(dir, false)
  } else {
    createTypedFile(dir, ext)
  }
}

// Handle context menu creation (target: clicked folder or workspace root)
function handleContextCreate({ ext, isDir }) {
  const dir = contextMenu.entry?.is_dir ? contextMenu.entry.path : workspace.path
  if (!dir) return

  if (isDir) {
    startInlineCreate(dir, true)
  } else if (!ext) {
    startInlineCreate(dir, false)
  } else {
    createTypedFile(dir, ext)
  }
}

// Duplicate a file or folder
async function handleDuplicate(entry) {
  const newPath = await files.duplicatePath(entry.path)
  if (newPath) {
    const newName = newPath.split('/').pop()
    if (!entry.is_dir) {
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
          editor.openFile(path)
        }
      }
    } else if (renaming.originalPath) {
      // Auto-append extension if user omits it (for typed file rename after creation)
      if (renaming.autoExtension && !name.includes('.')) {
        name = name + renaming.autoExtension
      }
      const dir = renaming.originalPath.substring(0, renaming.originalPath.lastIndexOf('/'))
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
  const yes = await ask(t('Delete "{name}"?', { name: entry.name }), {
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
      ? t('Delete "{name}"?', { name: paths[0].split('/').pop() })
      : t('Delete {count} items?', { count: paths.length })
  const yes = await ask(msg, { title: t('Confirm Delete'), kind: 'warning' })
  if (yes) {
    for (const path of paths) {
      await files.deletePath(path)
    }
    selectedPaths.clear()
  }
}

function handleImportToRefs(entry) {
  let paths
  if (selectedPaths.size > 1) {
    paths = [...selectedPaths].filter((p) => isImportableFile(p))
  } else {
    paths = [entry.path]
  }
  if (paths.length > 0) {
    window.dispatchEvent(new CustomEvent('ref-file-drop', { detail: { paths } }))
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
  activateFilter,
  collapseAllFolders,
  toggleCreateMenuFrom(anchorEl = null) {
    if (anchorEl) {
      newBtnEl.value = anchorEl
    }
    toggleNewMenu()
  },
  createNewFile(ext = '.md') {
    let targetDir = workspace.path

    if (selectedPaths.size > 0) {
      const selectedPath = getActivePath()
      const entry = findEntry(selectedPath)
      if (entry) {
        if (entry.is_dir) {
          targetDir = entry.path
          files.expandedDirs.add(targetDir)
        } else {
          targetDir = selectedPath.substring(0, selectedPath.lastIndexOf('/'))
        }
      }
    }

    createTypedFile(targetDir, ext)
  },
})
</script>

<style scoped>
.file-tree-shell {
  background: var(--bg-primary);
}

.file-tree-header {
  color: var(--text-muted);
}

.file-tree-header--with-divider {
  border-bottom: 1px solid var(--border);
}

.file-tree-chevron {
  transition: transform 0.1s ease;
}

.file-tree-chevron-open {
  transform: rotate(90deg);
}

.file-tree-search-input {
  background: var(--bg-tertiary);
  min-height: var(--sidebar-input-height);
  padding-inline: 7px;
  gap: var(--sidebar-inline-gap);
}

.file-tree-search-input :deep(.ui-input-control) {
  font-size: var(--sidebar-font-search);
}

.file-tree-search-icon {
  color: var(--text-muted);
}

.file-tree-root-rename-row {
  padding-left: 28px;
}

.file-tree-rename-input {
  font-size: var(--sidebar-font-control);
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
}

.file-tree-drop-indicator {
  border-color: var(--accent);
  color: var(--accent);
  opacity: 0.6;
}

.file-tree-empty-state {
  color: var(--text-muted);
}

.file-tree-workspace-shortcut {
  opacity: 1;
}

.workspace-footer-action {
  flex-shrink: 0;
  padding: 1px 0 0;
  border-top: 1px solid var(--border);
  background: var(--bg-primary);
}

.workspace-footer-action-button {
  position: relative;
  min-height: var(--sidebar-row-height);
  padding-inline: 30px;
  border: none;
  border-radius: 0;
  color: var(--fg-secondary);
}

.workspace-footer-action-button :deep(.ui-button-label) {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: var(--sidebar-font-control);
  letter-spacing: 0;
  line-height: 1.1;
}

.workspace-footer-action-button :deep(.ui-button-trailing) {
  position: absolute;
  right: 10px;
  top: 50%;
  width: 16px;
  height: 16px;
  color: var(--fg-muted);
  transform: translateY(-50%);
}

.workspace-footer-action-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--bg-hover) 42%, transparent);
  color: var(--fg-primary);
}
</style>
