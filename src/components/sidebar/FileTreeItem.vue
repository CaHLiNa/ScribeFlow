<template>
  <div>
    <div
      class="file-tree-item-row flex items-center cursor-pointer select-none tree-item"
      :class="{
        'is-active-row': isActive,
        'is-selected-row': !isActive && isSelected,
        'is-filter-highlighted': isFilterHighlighted,
        'tree-item-dragover': entry.is_dir && dragOverDir === entry.path,
      }"
      :style="{ paddingLeft: treeRowPadding(depth) + 'px' }"
      :data-dir-path="entry.is_dir ? entry.path : undefined"
      :data-path="entry.path"
      @click="handleClick"
      @contextmenu.prevent="handleContextMenu"
      @dblclick="handleDblClick"
      @mousedown="handleMouseDown"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
      @mouseup="handleMouseUp"
      @dragover.prevent.stop="handleNativeDragOver"
      @dragleave="handleNativeDragLeave"
      @drop.prevent.stop="handleNativeDrop"
    >
      <!-- Expand/collapse arrow for dirs -->
      <span
        v-if="entry.is_dir"
        class="file-tree-item-icon w-[14px] h-[14px] flex items-center justify-center shrink-0"
      >
        <IconChevronRight
          :size="11"
          :class="{ 'rotate-90': isExpanded }"
          class="transition-transform duration-100"
        />
      </span>
      <span v-else class="w-[14px] h-[14px] shrink-0"></span>

      <!-- File icon (files only; dirs use chevron as sole indicator) -->
      <span
        v-if="!entry.is_dir"
        class="file-tree-item-icon w-[14px] h-[14px] flex items-center justify-center shrink-0 mr-1"
      >
        <component :is="fileIconComponent" :size="11" :stroke-width="1.4" />
      </span>

      <!-- Name or rename input -->
      <template v-if="isRenaming">
        <UiInput
          ref="renameInputEl"
          :model-value="newItemValue"
          size="sm"
          shell-class="file-tree-item-rename-input"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          @update:modelValue="$emit('rename-input-change', $event)"
          @keydown.enter.stop="$emit('rename-input-submit')"
          @keydown.escape.stop="$emit('rename-input-cancel')"
          @blur="$emit('rename-input-submit')"
        />
      </template>
      <template v-else>
        <span class="file-tree-item-label truncate">
          <template v-if="filterQuery && nameSegments.length > 1">
            <template v-for="(seg, i) in nameSegments" :key="i">
              <span v-if="seg.match" class="file-tree-item-match">{{ seg.text }}</span>
              <template v-else>{{ seg.text }}</template>
            </template>
          </template>
          <template v-else>{{ entry.name }}</template>
        </span>
      </template>
    </div>

    <!-- Inline new item input (inside folder, before children) -->
    <div
      v-if="entry.is_dir && isExpanded && newItemParent === entry.path"
      class="file-tree-item-new-row flex items-center"
      :style="{ paddingLeft: treeNewItemPadding(depth) + 'px' }"
    >
      <UiInput
        ref="newItemInput"
        :model-value="newItemValue"
        size="sm"
        shell-class="file-tree-item-rename-input"
        :placeholder="newItemIsDir ? t('folder name') : t('document name')"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        @update:modelValue="$emit('rename-input-change', $event)"
        @keydown.enter.stop="$emit('rename-input-submit')"
        @keydown.escape.stop="$emit('rename-input-cancel')"
        @blur="$emit('rename-input-submit')"
      />
    </div>

    <!-- Children (if expanded directory) -->
    <template
      v-if="
        !suppressChildren &&
        entry.is_dir &&
        isExpanded &&
        entry.children !== null &&
        entry.children !== undefined
      "
    >
      <FileTreeItem
        v-for="child in entry.children"
        :key="child.path"
        :entry="child"
        :depth="depth + 1"
        :renamingPath="renamingPath"
        :newItemParent="newItemParent"
        :newItemValue="newItemValue"
        :newItemIsDir="newItemIsDir"
        :selectedPaths="selectedPaths"
        :dragOverDir="dragOverDir"
        :filterQuery="filterQuery"
        :forceExpand="forceExpand"
        :filterHighlightPath="filterHighlightPath"
        @open-file="$emit('open-file', $event)"
        @select-file="$emit('select-file', $event)"
        @context-menu="$emit('context-menu', $event)"
        @start-rename-input="$emit('start-rename-input')"
        @rename-input-change="$emit('rename-input-change', $event)"
        @rename-input-submit="$emit('rename-input-submit')"
        @rename-input-cancel="$emit('rename-input-cancel')"
        @drag-start="$emit('drag-start', $event)"
        @drag-over-dir="$emit('drag-over-dir', $event)"
        @drag-leave-dir="$emit('drag-leave-dir', $event)"
        @drop-on-dir="$emit('drop-on-dir', $event)"
        @external-drop="$emit('external-drop', $event)"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import {
  IconChevronRight,
  IconFile,
  IconFileText,
  IconBraces,
  IconFileCode,
  IconTerminal2,
  IconLock,
  IconBrandJavascript,
  IconBrandTypescript,
  IconBrandPython,
  IconBrandHtml5,
  IconBrandCss3,
  IconBrandVue,
  IconPhoto,
  IconFileTypePdf,
  IconTable,
  IconDatabase,
  IconSparkles,
  IconFileTypeDocx,
  IconFileTypeDoc,
  IconMath,
  IconNotebook,
  IconBook2,
} from '@tabler/icons-vue'
import { useFilesStore } from '../../stores/files'
import { useEditorStore } from '../../stores/editor'
import { isMod } from '../../platform'
import { getFileIconName } from '../../utils/fileTypes'
import { useI18n } from '../../i18n'
import UiInput from '../shared/ui/UiInput.vue'

const props = defineProps({
  entry: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  renamingPath: { type: String, default: null },
  newItemParent: { type: String, default: null },
  newItemValue: { type: String, default: '' },
  newItemIsDir: { type: Boolean, default: false },
  selectedPaths: { type: Object, default: () => new Set() },
  dragOverDir: { type: String, default: null },
  filterQuery: { type: String, default: '' },
  forceExpand: { type: Boolean, default: false },
  filterHighlightPath: { type: String, default: '' },
  suppressChildren: { type: Boolean, default: false },
})

const emit = defineEmits([
  'open-file',
  'select-file',
  'context-menu',
  'start-rename-input',
  'rename-input-change',
  'rename-input-submit',
  'rename-input-cancel',
  'drag-start',
  'drag-over-dir',
  'drag-leave-dir',
  'drop-on-dir',
  'external-drop',
])

const files = useFilesStore()
const editor = useEditorStore()
const { t } = useI18n()

const TREE_INDENT_STEP = 8
const TREE_ROOT_OFFSET = 2
const TREE_NEW_ITEM_OFFSET = 14

const renameInputEl = ref(null)
const newItemInput = ref(null)

const isExpanded = computed(() => props.forceExpand || files.isDirExpanded(props.entry.path))
const isFilterHighlighted = computed(
  () => props.filterHighlightPath && props.entry.path === props.filterHighlightPath
)
const isActive = computed(() => editor.activeTab === props.entry.path)
const isSelected = computed(() => props.selectedPaths.has(props.entry.path))
const isRenaming = computed(() => props.renamingPath === props.entry.path)

const ICON_COMPONENTS = {
  IconFile,
  IconFileText,
  IconBraces,
  IconFileCode,
  IconTerminal2,
  IconLock,
  IconBrandJavascript,
  IconBrandTypescript,
  IconBrandPython,
  IconBrandHtml5,
  IconBrandCss3,
  IconBrandVue,
  IconPhoto,
  IconFileTypePdf,
  IconTable,
  IconDatabase,
  IconSparkles,
  IconFileTypeDocx,
  IconFileTypeDoc,
  IconMath,
  IconNotebook,
  IconBook2,
}

const fileIconComponent = computed(() => {
  const iconName = getFileIconName(props.entry.name)
  return ICON_COMPONENTS[iconName] || IconFile
})

const nameSegments = computed(() => {
  if (!props.filterQuery) return[{ text: props.entry.name, match: false }]
  const q = props.filterQuery.toLowerCase()
  const name = props.entry.name
  const idx = name.toLowerCase().indexOf(q)
  if (idx === -1) return [{ text: name, match: false }]
  const segments =[]
  if (idx > 0) segments.push({ text: name.slice(0, idx), match: false })
  segments.push({ text: name.slice(idx, idx + q.length), match: true })
  if (idx + q.length < name.length)
    segments.push({ text: name.slice(idx + q.length), match: false })
  return segments
})

watch(isRenaming, (v) => {
  if (v) {
    nextTick(() => {
      const el = renameInputEl.value?.inputEl
      if (!el) return
      emit('start-rename-input')
      el.focus()
      const name = props.entry.name
      const dotIdx = name.lastIndexOf('.')
      if (dotIdx > 0) {
        el.setSelectionRange(0, dotIdx)
      } else {
        el.select()
      }
    })
  }
})

watch(
  () => props.newItemParent === props.entry.path && isExpanded.value,
  (v) => {
    if (v) {
      nextTick(() => {
        newItemInput.value?.focus()
      })
    }
  }
)

let mouseDownInfo = null
let dragExpandTimer = null

function handleMouseDown(event) {
  if (event.button !== 0 || isRenaming.value) return

  mouseDownInfo = {
    x: event.clientX,
    y: event.clientY,
    path: props.entry.path,
  }

  const onMouseMove = (ev) => {
    if (!mouseDownInfo) return
    const dx = ev.clientX - mouseDownInfo.x
    const dy = ev.clientY - mouseDownInfo.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      emit('drag-start', { path: mouseDownInfo.path, event: ev })
      mouseDownInfo = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }

  const onMouseUp = () => {
    mouseDownInfo = null
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function handleMouseEnter() {
  if (!props.entry.is_dir) return
  if (document.body.classList.contains('tab-dragging')) {
    emit('drag-over-dir', props.entry.path)
  }
}

function handleMouseLeave() {
  if (!props.entry.is_dir) return
  if (document.body.classList.contains('tab-dragging')) {
    emit('drag-leave-dir', props.entry.path)
  }
}

function handleMouseUp() {
  if (!props.entry.is_dir) return
  if (document.body.classList.contains('tab-dragging')) {
    emit('drop-on-dir', props.entry.path)
  }
}

function handleNativeDragOver(e) {
  if (!props.entry.is_dir) return
  if (!e.dataTransfer?.types?.includes('Files')) return
  e.dataTransfer.dropEffect = 'copy'
  emit('drag-over-dir', props.entry.path)
  
  // 核心魔法：悬停 800ms 后自动展开文件夹
  if (!isExpanded.value && !dragExpandTimer) {
    dragExpandTimer = setTimeout(() => {
      files.expandedDirs.add(props.entry.path)
    }, 800)
  }
}

function handleNativeDragLeave() {
  if (!props.entry.is_dir) return
  emit('drag-leave-dir', props.entry.path)
  if (dragExpandTimer) {
    clearTimeout(dragExpandTimer)
    dragExpandTimer = null
  }
}

function handleNativeDrop(e) {
  if (!props.entry.is_dir) return
  if (dragExpandTimer) {
    clearTimeout(dragExpandTimer)
    dragExpandTimer = null
  }
  if (!e.dataTransfer?.files?.length) return
  emit('external-drop', { dir: props.entry.path, files: e.dataTransfer.files })
}

async function handleClick(event) {
  emit('select-file', { path: props.entry.path, event })
  if (props.entry.is_dir) {
    await files.toggleDir(props.entry.path)
  } else if (!event.shiftKey && !isMod(event)) {
    emit('open-file', props.entry.path)
  }
}

function handleDblClick() {
  if (!props.entry.is_dir) {
    emit('open-file', props.entry.path)
  }
}

function handleContextMenu(event) {
  emit('context-menu', { event, entry: props.entry })
}

function treeRowPadding(depth) {
  return depth * TREE_INDENT_STEP + TREE_ROOT_OFFSET
}

function treeNewItemPadding(depth) {
  return (depth + 1) * TREE_INDENT_STEP + TREE_NEW_ITEM_OFFSET
}
</script>

<style scoped>
.tree-item-dragover {
  background: var(--shell-accent-surface);
  box-shadow: inset 0 0 0 1px var(--shell-accent-border);
}

.file-tree-item-row {
  position: relative;
  min-height: 24px;
  padding-right: 8px;
  border-radius: 4px;
  margin: 1px 0;
  color: var(--text-primary);
  opacity: 1;
}

.file-tree-item-row:hover {
  background: var(--sidebar-item-hover);
}

.file-tree-item-row.is-active-row,
.file-tree-item-row.is-selected-row {
  background: var(--list-active-bg);
  color: var(--list-active-fg) !important;
  box-shadow: none;
}

.file-tree-item-row.is-active-row .file-tree-item-label,
.file-tree-item-row.is-selected-row .file-tree-item-label {
  color: var(--list-active-fg) !important;
  font-weight: 600; 
}

.file-tree-item-row.is-active-row .file-tree-item-icon,
.file-tree-item-row.is-selected-row .file-tree-item-icon {
  opacity: 0.9;
}

.file-tree-item-row.is-filter-highlighted:not(.is-active-row):not(.is-selected-row) {
  background: var(--sidebar-item-hover);
}

.file-tree-item-icon {
  color: var(--text-muted);
  opacity: 0.8;
}

.file-tree-item-new-row {
  min-height: var(--sidebar-row-height-tight);
  padding-right: 8px;
}

.file-tree-item-label {
  font-size: 13px;
  line-height: 1.2;
}

.file-tree-item-match {
  color: var(--accent);
}

.file-tree-item-rename-input {
  font-size: 13px;
  border-color: color-mix(in srgb, var(--border) 48%, transparent);
  border-radius: 4px;
  background: var(--surface-base);
}
</style>
