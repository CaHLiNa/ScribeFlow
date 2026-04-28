<template>
  <div class="file-tree-shell flex flex-col flex-1 min-h-0 h-full">
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
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          class="file-tree-chevron"
          :class="{ 'file-tree-chevron-open': !collapsed }"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        <span class="ui-sidebar-kicker truncate min-w-0">{{ headingLabel || workspaceName }}</span>
      </div>
      <div v-if="!collapsed" class="flex items-center gap-1 shrink-0">
        <UiButton
          class="file-tree-header-action"
          variant="ghost"
          size="icon-sm"
          icon-only
          @click.stop="collapseAllFolders"
          :title="t('Collapse All Folders')"
          :aria-label="t('Collapse All Folders')"
        >
          <IconFolderMinus :size="17" :stroke-width="1.75" />
        </UiButton>
        <UiButton
          ref="newBtnEl"
          class="file-tree-header-action"
          variant="ghost"
          size="icon-sm"
          icon-only
          @click.stop="toggleNewMenu"
          :title="t('New File or Folder')"
          :aria-label="t('New File or Folder')"
        >
          <IconPlus :size="15" :stroke-width="1.9" />
        </UiButton>
      </div>
    </div>

    <template v-if="!collapsed">
      <div class="file-tree-body">
        <!-- Search input -->
        <div class="file-tree-search-row shrink-0">
          <UiInput
            ref="filterInputEl"
            v-model="filterQuery"
            size="sm"
            shell-class="file-tree-search-input"
            :placeholder="t('Search files')"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            @keydown="handleFilterInputKeydown"
          >
            <template #prefix>
              <IconSearch :size="14" :stroke-width="1.6" class="file-tree-search-icon" />
            </template>
          </UiInput>
        </div>

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
      </div>

      <div class="workspace-footer-action">
        <UiButton
          class="workspace-footer-icon-button"
          variant="ghost"
          size="icon-sm"
          icon-only
          :title="t('Settings ({shortcut})', { shortcut: `${modKey}+,` })"
          :aria-label="t('Settings')"
          @click.stop="emit('open-settings')"
        >
          <IconSettings :size="17" :stroke-width="1.8" />
        </UiButton>

        <UiButton
          class="workspace-footer-action-button"
          variant="ghost"
          size="sm"
          block
          :title="t('Open Folder...')"
          :aria-label="t('Open Folder...')"
          @click.stop="emit('open-folder')"
        >
          {{ t('Open Folder...') }}
        </UiButton>

        <UiButton
          ref="workspaceMenuAnchorEl"
          class="workspace-footer-icon-button"
          variant="ghost"
          size="icon-sm"
          icon-only
          :title="t('Workspace Menu')"
          :aria-label="t('Workspace Menu')"
          @click.stop="toggleWorkspaceMenu"
        >
          <IconDotsVertical :size="17" :stroke-width="1.8" />
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
        @reveal-in-finder="revealInFinder"
      />

      <!-- Workspace dropdown menu -->
      <Teleport to="body">
        <div
          v-if="workspaceMenuOpen"
          ref="workspaceMenuEl"
          class="context-menu file-tree-workspace-menu file-tree-workspace-menu-popover"
          :style="workspaceMenuStyle"
          role="menu"
          :aria-label="t('Workspace Menu')"
        >
          <button
            type="button"
            class="context-menu-item file-tree-workspace-item"
            role="menuitem"
            @click="handleWorkspaceMenuOpenFolder"
          >
            <span class="file-tree-workspace-item-label">{{ t('Open Folder...') }}</span>
            <span class="context-menu-ext file-tree-workspace-shortcut">{{ modKey }}+O</span>
          </button>
          <button
            type="button"
            class="context-menu-item file-tree-workspace-item"
            role="menuitem"
            @click="handleWorkspaceMenuOpenSettings"
          >
            <span class="file-tree-workspace-item-label">{{ t('Settings...') }}</span>
            <span class="context-menu-ext file-tree-workspace-shortcut">{{ modKey }},</span>
          </button>
          <template v-if="recentWorkspaces.length">
            <div class="context-menu-separator"></div>
            <div class="context-menu-section">{{ t('Recent') }}</div>
            <button
              v-for="recent in recentWorkspaces"
              :key="recent.path"
              type="button"
              class="context-menu-item file-tree-workspace-item"
              role="menuitem"
              :title="recent.name"
              @click="handleWorkspaceMenuOpenRecent(recent.path)"
            >
              <span class="file-tree-workspace-item-label">{{ recent.name }}</span>
            </button>
          </template>
          <div class="context-menu-separator"></div>
          <button
            type="button"
            class="context-menu-item file-tree-workspace-item"
            role="menuitem"
            @click="handleWorkspaceMenuCloseFolder"
          >
            <span class="file-tree-workspace-item-label">{{ t('Close Folder') }}</span>
          </button>
        </div>
      </Teleport>

      <!-- "+ New" dropdown menu -->
      <Teleport to="body">
        <div
          v-if="newMenuOpen"
          class="context-menu-backdrop"
          @mousedown.prevent.stop="closeNewMenu"
          @contextmenu.prevent.stop="closeNewMenu"
        ></div>
        <div
          v-if="newMenuOpen"
          ref="newMenuEl"
          class="context-menu file-tree-new-menu"
          :style="newMenuStyle"
          @contextmenu.prevent.stop
        >
          <button
            type="button"
            class="context-menu-item"
            @click.stop="handleNewMenuCreate({ ext: null, isDir: true })"
          >
            <IconFolderPlus :size="14" :stroke-width="1.5" />
            <span class="file-tree-workspace-item-label">{{ t('New Folder') }}</span>
          </button>
          <button
            type="button"
            class="context-menu-item"
            @click.stop="handleNewMenuCreate({ ext: null })"
          >
            <IconFilePlus :size="14" :stroke-width="1.5" />
            <span class="file-tree-workspace-item-label">{{ t('New File...') }}</span>
          </button>
          <div class="context-menu-separator"></div>
          <button
            v-for="template in documentTemplates"
            :key="template.id"
            type="button"
            class="context-menu-item"
            @click.stop="
              handleNewMenuCreate({
                ext: template.ext,
                suggestedName: template.filename,
                initialContent: template.content,
              })
            "
          >
            <component
              :is="template.ext === '.tex' ? IconMath : IconFileText"
              :size="14"
              :stroke-width="1.5"
            />
            <span class="file-tree-workspace-item-label">{{ template.label }}</span>
            <span class="context-menu-ext">{{ template.ext }}</span>
          </button>
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
import { ref, reactive, computed, nextTick, watch, onBeforeUnmount } from 'vue'
import { useFilesStore } from '../../stores/files'
import { useEditorStore } from '../../stores/editor'
import { useWorkspaceStore } from '../../stores/workspace'
import { applyFileTreeDisplayPreferences } from '../../domains/files/fileTreeDisplayRuntime'
import { listWorkspaceFlatFileEntries } from '../../domains/files/workspaceSnapshotFlatFilesRuntime'
import { listWorkspaceDocumentTemplates } from '../../domains/workspace/workspaceTemplateRuntime'
import FileTreeItem from './FileTreeItem.vue'
import { isMod, modKey } from '../../platform'
import ContextMenu from './ContextMenu.vue'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'
import {
  IconFolderMinus,
  IconSearch,
  IconPlus,
  IconFileText,
  IconMath,
  IconFilePlus,
  IconFolderPlus,
  IconDotsVertical,
  IconSettings,
} from '@tabler/icons-vue'
import { ask } from '@tauri-apps/plugin-dialog'
import { useI18n } from '../../i18n'
import { pathExists, revealPathInFileManager } from '../../services/fileTreeSystem'
import { useFileTreeFilter } from '../../composables/useFileTreeFilter'
import { useFileTreeDrag } from '../../composables/useFileTreeDrag'
import { useTransientOverlayDismiss } from '../../composables/useTransientOverlayDismiss'
import { resolveFloatingReference } from '../../utils/floatingReference'
import { basenamePath, dirnamePath } from '../../utils/path'

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

const workspaceName = computed(() => {
  if (!workspace.path) return t('Explorer')
  return basenamePath(workspace.path)
})
const recentWorkspaces = computed(() => workspace.recentWorkspaces.slice(0, 5))
const workspaceSnapshot = computed(
  () => files.lastWorkspaceSnapshot || { flatFiles: files.flatFiles }
)
const workspaceFlatFiles = computed(() => listWorkspaceFlatFileEntries(workspaceSnapshot.value))
const fileTreeDisplayEntries = computed(() =>
  applyFileTreeDisplayPreferences(files.tree, {
    showHidden: workspace.fileTreeShowHidden,
    sortMode: workspace.fileTreeSortMode,
    foldDirectories: workspace.fileTreeFoldDirectories,
  })
)

const treeContainer = ref(null)
const renameInput = ref(null)
const filterInputEl = ref(null)
const workspaceMenuAnchorEl = ref(null)
const workspaceMenuEl = ref(null)
const newBtnEl = ref(null)
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

function handleFilterInputKeydown(event) {
  handleFilterKeydown(event)
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

function toggleWorkspaceMenu() {
  const nextOpen = !workspaceMenuOpen.value
  if (nextOpen) {
    dismissOtherTransientOverlays()
    closeNewMenu()
  }
  workspaceMenuOpen.value = nextOpen
}

const newMenuEl = ref(null)
const newMenuStyle = ref({ top: '0px', left: '0px' })

async function calculateNewMenuPosition(anchor) {
  if (!anchor) return
  await nextTick()
  if (!newMenuEl.value) return

  const rect = anchor.getBoundingClientRect()
  const menuRect = newMenuEl.value.getBoundingClientRect()
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
    calculateNewMenuPosition(anchorEl || newBtnEl.value?.$el || newBtnEl.value)
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
  if (workspaceMenuEl.value?.contains(target) || anchor?.contains?.(target)) return

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
    (await pathExists(`${dir}/${name}`))
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
      ? t('Delete "{name}"?', { name: basenamePath(paths[0]) })
      : t('Delete {count} items?', { count: paths.length })
  const yes = await ask(msg, { title: t('Confirm Delete'), kind: 'warning' })
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
  beginNewFile(ext = '.md') {
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
  activateFilter,
  collapseAllFolders,
  toggleCreateMenuFrom(anchorEl = null) {
    toggleNewMenu(anchorEl)
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

.file-tree-header {
  color: var(--text-muted);
}

.file-tree-header-action {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  color: color-mix(in srgb, var(--text-muted) 90%, transparent);
}

.file-tree-header--with-divider {
  border-bottom: 0;
}

.file-tree-chevron {
  transition: transform 0.1s ease;
}

.file-tree-chevron-open {
  transform: rotate(90deg);
}

.file-tree-search-row {
  padding: 14px 8px 0;
}

:deep(.file-tree-search-input) {
  border-color: color-mix(in srgb, var(--sidebar-search-border) 68%, transparent);
  border-radius: 11px;
  background: color-mix(in srgb, var(--sidebar-search-surface) 72%, transparent);
  min-height: 28px;
  padding-inline: 10px;
  gap: var(--sidebar-inline-gap);
  box-shadow: none;
  opacity: 1;
}

:deep(.file-tree-search-input:focus-within) {
  border-color: color-mix(in srgb, var(--sidebar-search-border-focus) 80%, transparent);
  background: color-mix(in srgb, var(--sidebar-search-surface-focus) 78%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--focus-ring) 42%, transparent);
  opacity: 1;
}

:deep(.file-tree-search-input .ui-input-control) {
  font-size: var(--sidebar-font-search);
  line-height: 1.1;
}

:deep(.file-tree-search-input .ui-input-control::placeholder) {
  color: color-mix(in srgb, var(--text-muted) 78%, transparent);
  opacity: 1;
}

.file-tree-search-icon {
  color: color-mix(in srgb, var(--text-muted) 82%, transparent);
}

:deep(.file-tree-search-input.ui-input-shell--sm) {
  min-height: 28px;
  padding-inline: 10px;
}

:deep(.file-tree-search-input .ui-input-affix) {
  height: 14px;
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

.file-tree-workspace-shortcut {
  opacity: 1;
}

.file-tree-workspace-menu {
  max-height: min(50vh, 420px);
  overflow-y: auto;
}

.file-tree-workspace-menu-popover {
  position: fixed !important;
  width: min(240px, calc(100vw - 16px));
  max-width: min(240px, calc(100vw - 16px));
}

.file-tree-workspace-item {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
}

.file-tree-workspace-item-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-tree-new-menu {
  min-width: 200px !important;
  max-height: min(50vh, 360px);
  overflow-y: auto;
}

.workspace-footer-action {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  padding: 4px 0 0;
  background: transparent;
}

.workspace-footer-icon-button {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  color: color-mix(in srgb, var(--fg-muted) 78%, transparent);
  opacity: 0.86;
}

.workspace-footer-icon-button:hover:not(:disabled) {
  opacity: 1;
  background: transparent;
}

.workspace-footer-icon-button:focus-visible {
  background: transparent;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--focus-ring) 46%, transparent);
}

.workspace-footer-action-button {
  position: relative;
  flex: 1 1 auto;
  min-height: 32px;
  justify-content: center;
  padding-inline: 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--fg-secondary);
  transition:
    background-color 140ms ease,
    color 140ms ease,
    border-color 140ms ease;
}

.workspace-footer-action-button :deep(.ui-button-label) {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: var(--sidebar-font-item);
  letter-spacing: 0;
  line-height: 1.1;
}

.workspace-footer-action-button:hover:not(:disabled) {
  background: transparent;
  color: var(--fg-primary);
}

.workspace-footer-action-button:focus-visible {
  background: transparent;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--focus-ring) 46%, transparent);
}
</style>
