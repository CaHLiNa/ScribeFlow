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
      <FileTreeBody
        ref="fileTreeBody"
        :drag-over-dir="dragOverDir"
        :external-drag-over="externalDragOver"
        :new-item-is-dir="renaming.isDir"
        :new-item-parent="renaming.active && renaming.isNew ? renaming.parentDir : null"
        :new-item-value="renaming.value"
        :renaming-active="renaming.active"
        :renaming-path="renaming.active && !renaming.isNew ? renaming.originalPath : null"
        :root-new-active="renaming.active && renaming.isNew && renaming.parentDir === workspace.path"
        :root-new-value="renaming.value"
        :selected-paths="selectedPaths"
        :total-tree-height="totalTreeHeight"
        :virtual-offset="virtualOffset"
        :virtual-rows="virtualRows"
        :visible-row-count="visibleRows.length"
        @context-menu-empty="showContextMenuOnEmpty"
        @drag-leave-dir="onDragLeaveDir"
        @drag-over-dir="(dir) => (dragOverDir = dir)"
        @drag-start="onDragStart"
        @drop-on-dir="onDropOnDir"
        @open-file="openFile"
        @rename-input-cancel="cancelRename"
        @rename-input-change="(v) => (renaming.value = v)"
        @rename-input-submit="finishRename"
        @root-rename-cancel="cancelRename"
        @root-rename-submit="finishRename"
        @root-rename-value-change="(v) => (renaming.value = v)"
        @select-file="onSelectFile"
        @show-context-menu="showContextMenu"
        @start-rename-input="onStartRenameInput"
        @tree-keydown="handleTreeKeydown"
        @tree-container-ready="setTreeContainer"
        @tree-mouse-up="onTreeMouseUp"
        @tree-scroll="onTreeScroll"
      />

      <FileTreeFooter
        @open-folder="emit('open-folder')"
        @open-settings="emit('open-settings')"
        @toggle-workspace-menu="toggleWorkspaceMenu"
      />

      <FileTreeOverlays
        ref="fileTreeOverlays"
        :context-menu-visible="contextMenu.show"
        :context-menu-x="contextMenu.x"
        :context-menu-y="contextMenu.y"
        :context-menu-entry="contextMenu.entry"
        :selected-count="selectedPaths.size"
        :workspace-menu-open="workspaceMenuOpen"
        :workspace-menu-style="workspaceMenuStyle"
        :recent-workspaces="recentWorkspaces"
        :new-menu-open="newMenuOpen"
        :new-menu-style="newMenuStyle"
        :document-templates="documentTemplates"
        :drag-ghost-visible="dragGhostVisible"
        :drag-ghost-x="dragGhostX"
        :drag-ghost-y="dragGhostY"
        :drag-ghost-label="dragGhostLabel"
        @close-context-menu="contextMenu.show = false"
        @context-create="handleContextCreate"
        @context-rename="handleRename"
        @context-duplicate="handleDuplicate"
        @context-delete="handleDelete"
        @context-delete-selected="handleDeleteSelected"
        @context-reveal-in-finder="revealInFinder"
        @context-open-in-document-dock="openInDocumentDock"
        @workspace-open-folder="handleWorkspaceMenuOpenFolder"
        @workspace-open-settings="handleWorkspaceMenuOpenSettings"
        @workspace-open-recent="handleWorkspaceMenuOpenRecent"
        @workspace-close-folder="handleWorkspaceMenuCloseFolder"
        @new-menu-close="closeNewMenu"
        @new-menu-create="handleNewMenuCreate"
      />
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
import {
  appendTypedFileExtension,
  buildFileTreeRenameState,
  buildTypedFileNameCandidate,
  deriveTypedFileNameCandidates,
  listFileTreeRecentWorkspaces,
  resetFileTreeRenameState,
  resolveFileTreeWorkspaceName,
  resolveNewMenuStyle,
  resolveWorkspaceMenuPosition,
  resolveWorkspaceMenuStyle,
} from '../../domains/files/fileTreePresentation.js'
import { listWorkspaceFlatFileEntries } from '../../domains/files/workspaceSnapshotFlatFilesRuntime.js'
import { listWorkspaceDocumentTemplates } from '../../domains/workspace/workspaceTemplateRuntime'
import FileTreeBody from './FileTreeBody.vue'
import FileTreeFooter from './FileTreeFooter.vue'
import FileTreeHeader from './FileTreeHeader.vue'
import FileTreeOverlays from './FileTreeOverlays.vue'
import { isMod } from '../../platform'
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
const workspaceName = computed(() =>
  resolveFileTreeWorkspaceName({
    workspacePath: workspace.path,
    workspaceBasename: workspaceBasename.value,
    translate: t,
  })
)
const recentWorkspaces = computed(() => listFileTreeRecentWorkspaces(workspace.recentWorkspaces))
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
const fileTreeBody = ref(null)
const fileTreeOverlays = ref(null)
const workspaceMenuAnchorEl = ref(null)
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
const workspaceMenuStyle = computed(() => resolveWorkspaceMenuStyle(workspaceMenuPosition))

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
  const menuEl = fileTreeOverlays.value?.getNewMenuElement?.()
  if (!menuEl) return

  const rect = anchor.getBoundingClientRect()
  const menuRect = menuEl.getBoundingClientRect()
  const vh = window.innerHeight || document.documentElement.clientHeight

  newMenuStyle.value = resolveNewMenuStyle({
    anchorRect: rect,
    menuRect,
    viewportHeight: vh,
  })
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

  Object.assign(
    workspaceMenuPosition,
    resolveWorkspaceMenuPosition({
      anchorRect: rect,
      viewportWidth,
      viewportHeight,
    })
  )
}

function handleWorkspaceMenuDocumentPointerDown(event) {
  const target = event.target
  if (!(target instanceof Node)) return

  const anchor = workspaceMenuReference.value
  const menuEl = fileTreeOverlays.value?.getWorkspaceMenuElement?.()
  if (menuEl?.contains(target) || anchor?.contains?.(target)) return

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

  const fileNameParams = {
    suggestedName: options.suggestedName,
    extension: ext,
    fallbackBaseName: t('Untitled'),
  }

  let name = ''
  let candidateIndex = 0
  for (const [index, candidate] of deriveTypedFileNameCandidates(fileNameParams).entries()) {
    candidateIndex = index
    name = candidate
    if (
      !workspaceFlatFiles.value.some((f) => f.name === name) &&
      !(await workspacePathExists(`${dir}/${name}`))
    ) {
      break
    }
  }

  while (
    workspaceFlatFiles.value.some((f) => f.name === name) ||
    (await workspacePathExists(`${dir}/${name}`))
  ) {
    candidateIndex += 1
    name = buildTypedFileNameCandidate({
      ...fileNameParams,
      index: candidateIndex,
    })
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

  Object.assign(
    renaming,
    buildFileTreeRenameState({
      isNew: true,
      isDir,
      parentDir: dir,
      value: isDir ? t('new-folder') : '',
    })
  )

  nextTick(() => {
    if (dir === workspace.path) {
      fileTreeBody.value?.selectRootRenameInput?.()
    }
  })
}

function startInlineTypedFileCreate(dir, ext = '.md') {
  startInlineCreate(dir, false)
  renaming.autoExtension = ext
}

function handleRename(entry) {
  Object.assign(renaming, buildFileTreeRenameState({ entry }))
}

function onStartRenameInput() {
  // Called by FileTreeItem when the inline input is mounted
}

function setTreeContainer(element) {
  treeContainer.value = element
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
      name = appendTypedFileExtension(name, renaming.autoExtension)

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
      name = appendTypedFileExtension(name, renaming.autoExtension)
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
  Object.assign(renaming, resetFileTreeRenameState())
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
</style>
