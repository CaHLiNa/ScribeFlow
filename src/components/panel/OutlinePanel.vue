<!-- START OF FILE src/components/panel/OutlinePanel.vue -->
<template>
  <div class="outline-panel" :class="{ 'outline-panel--embedded': embedded }">
    <div v-if="!hasOutlineSupport" class="outline-panel-empty">
      <div class="outline-panel-empty-copy text-center">
        <div class="outline-panel-empty-title">{{ t('No outline') }}</div>
        <div class="outline-panel-empty-hint">
          {{ t('Add headings to your document to create an outline.') }}
        </div>
      </div>
    </div>

    <div v-else-if="visibleOutlineItems.length === 0" class="outline-panel-empty-copy px-3 py-3">
      {{ t('No headings') }}
    </div>

    <div v-else class="outline-panel-scroll">
      <div
        v-for="renderItem in outlineRenderItems"
        :key="renderItem.key"
        class="outline-panel-row ui-list-row"
        :class="{ 'is-active': renderItem.key === activeOutlineItemKey }"
        @click="navigateToOutlineItem(renderItem.item)"
      >
        <!-- 核心重构：独立抽出缩进和参考线容器 -->
        <div class="outline-indent" :style="{ width: getIndentWidth(renderItem.item) + 'px' }">
          <div 
            v-for="i in getIndentLevels(renderItem.item)" 
            :key="i" 
            class="outline-guide"
          ></div>
        </div>

        <button
          v-if="renderItem.hasChildren"
          type="button"
          class="outline-panel-item-toggle"
          :class="{ 'is-collapsed': isHeadingCollapsed(renderItem.key) }"
          :aria-label="
            isHeadingCollapsed(renderItem.key)
              ? t('Expand outline level')
              : t('Collapse outline level')
          "
          @click.stop="toggleHeadingCollapse(renderItem.key)"
        >
          <svg
            class="outline-panel-item-chevron"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M4 2.5 7.5 6 4 9.5" />
          </svg>
        </button>
        <span
          v-else-if="renderItem.isTreeNode"
          class="outline-panel-item-toggle outline-panel-item-toggle--placeholder"
          aria-hidden="true"
        ></span>
        
        <span
          v-if="getOutlineKindLabel(renderItem.item.kind)"
          class="outline-panel-kind"
        >
          {{ getOutlineKindLabel(renderItem.item.kind) }}
        </span>
        <span class="truncate">{{ renderItem.item.text }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { focusEditorRangeWithHighlight } from '../../editor/revealHighlight'
import { useEditorStore } from '../../stores/editor'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useFilesStore } from '../../stores/files'
import { isMarkdown, isLatex, getViewerType } from '../../utils/fileTypes'
import { resolveDocumentOutlineItems } from '../../services/documentOutline/runtime'
import { useI18n } from '../../i18n'

const props = defineProps({
  collapsed: { type: Boolean, default: false },
  overrideActiveFile: { type: String, default: null },
  embedded: { type: Boolean, default: false },
})
defineEmits(['toggle-collapse'])

const editorStore = useEditorStore()
const workflowStore = useDocumentWorkflowStore()
const filesStore = useFilesStore()
const { t } = useI18n()
const collapsedHeadings = ref({})

function outlineTypeForPath(path) {
  if (!path) return null
  const vt = getViewerType(path)
  if (vt === 'text' && isMarkdown(path)) return 'markdown'
  if (vt === 'text' && isLatex(path)) return 'latex'
  return null
}

function resolveOutlinePath(path) {
  if (!path) return null
  if (outlineTypeForPath(path)) return path

  const sourcePath = workflowStore.getSourcePathForPreview(path)
  if (outlineTypeForPath(sourcePath)) return sourcePath
  return path
}

const activeFile = computed(() => resolveOutlinePath(props.overrideActiveFile || editorStore.activeTab))
const fileType = computed(() => outlineTypeForPath(activeFile.value))
const hasOutlineSupport = computed(() => fileType.value !== null)
const outlineItems = ref([])
let outlineRequestId = 0

function currentDocumentText(path) {
  const view = editorStore.getAnyEditorView(path)
  if (view) return view.state.doc.toString()
  return filesStore.fileContents[path] || ''
}

async function refreshDocumentOutline() {
  const path = activeFile.value
  const content = path ? currentDocumentText(path) : ''
  const requestId = ++outlineRequestId

  if (!path || !fileType.value || !content) {
    if (requestId === outlineRequestId) outlineItems.value =[]
    return
  }

  try {
    const items = await resolveDocumentOutlineItems(path, {
      content,
      filesStore,
      contentOverrides: { [path]: content },
    })
    if (requestId === outlineRequestId && activeFile.value === path) {
      outlineItems.value = Array.isArray(items) ? items :[]
    }
  } catch {
    if (requestId === outlineRequestId) outlineItems.value =[]
  }
}

const visibleOutlineItems = computed(() =>
  outlineItems.value.filter((item) =>['heading', 'appendix', 'figure', 'table', 'bibliography'].includes(item.kind)
  )
)

const activeOutlineItemKey = computed(() => {
  const ft = fileType.value
  if (!ft) return ''
  const offset = editorStore.cursorOffset
  if (offset == null) return ''

  let activeItem = null
  for (let i = 0; i < visibleOutlineItems.value.length; i++) {
    const itemPath = visibleOutlineItems.value[i].filePath || activeFile.value
    if (itemPath !== activeFile.value) continue
    if (visibleOutlineItems.value[i].offset <= offset) {
      activeItem = visibleOutlineItems.value[i]
    } else {
      break
    }
  }
  return activeItem ? outlineItemKey(activeItem) : ''
})

function focusTextOffset(path, offset, attempts = 0) {
  const targetView = editorStore.getAnyEditorView(path)
  if (!targetView) {
    if (attempts < 20) {
      window.setTimeout(() => focusTextOffset(path, offset, attempts + 1), 40)
    }
    return
  }

  const pos = Math.min(Number(offset) || 0, targetView.state.doc.length)
  focusEditorRangeWithHighlight(targetView, pos, pos, { center: true })
}

function navigateToOutlineItem(item) {
  const path = activeFile.value
  if (!path) return

  const ft = fileType.value
  const targetPath = item.filePath || path

  if (ft === 'markdown' || ft === 'latex') {
    const targetPaneId = editorStore.findPaneWithTab(targetPath)?.id || editorStore.activePaneId
    editorStore.openFileInPane(targetPath, targetPaneId, { activatePane: true })
    focusTextOffset(targetPath, item.offset)
  }
}

function getOutlineKindLabel(kind) {
  if (kind === 'figure') return 'Fig'
  if (kind === 'table') return 'Tbl'
  if (kind === 'appendix') return 'Appx'
  return ''
}

// 辅助线逻辑
const INDENT_STEP = 12; // 加宽一点缩进距，让视觉不拥挤
function getIndentLevels(item = {}) {
  if (!['heading', 'appendix'].includes(item.kind)) return 0
  const displayLevel = Math.max(1, Number(item.displayLevel || item.level) || 1)
  return Math.max(0, displayLevel - 1)
}

function getIndentWidth(item = {}) {
  const levels = getIndentLevels(item)
  return levels * INDENT_STEP + 6
}

function outlineItemKey(item = {}) {
  if (item.nodeKey) return String(item.nodeKey)
  return[
    item.filePath || activeFile.value || '',
    item.offset || 0,
    item.kind || 'heading',
    item.text || '',
  ].join('::')
}

function isHeadingCollapsed(itemKey) {
  return collapsedHeadings.value[itemKey] === true
}

function toggleHeadingCollapse(itemKey) {
  collapsedHeadings.value = {
    ...collapsedHeadings.value,[itemKey]: !isHeadingCollapsed(itemKey),
  }
}

const outlineRenderItems = computed(() => {
  return visibleOutlineItems.value
    .map((item) => {
      const key = outlineItemKey(item)
      return {
        key,
        item,
        hasChildren: item.hasChildren === true,
        isTreeNode: item.isTreeNode === true,
        ancestorKeys: Array.isArray(item.ancestorKeys) ? item.ancestorKeys :[],
      }
    })
    .filter((node) => node.ancestorKeys.every((key) => !isHeadingCollapsed(key)))
})

watch(
  () =>[activeFile.value, fileType.value, currentDocumentText(activeFile.value || '')],
  () => { void refreshDocumentOutline() },
  { immediate: true }
)

watch(
  visibleOutlineItems,
  (items) => {
    const nextHeadingState = {}
    for (const item of items) {
      const key = outlineItemKey(item)
      nextHeadingState[key] = collapsedHeadings.value[key] === true
    }
    collapsedHeadings.value = nextHeadingState
  },
  { immediate: true }
)
</script>

<style scoped>
.outline-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: transparent;
  padding-top: 0;
}

.outline-panel--embedded {
  padding-top: 0;
}

.outline-panel-empty {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
}

.outline-panel-empty-copy {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
}

.outline-panel-empty-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.outline-panel-empty-hint {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.8;
}

.outline-panel-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0 8px 4px; /* 增加整体侧边留白 */
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, black 18px, black calc(100% - 18px), transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0, black 18px, black calc(100% - 18px), transparent 100%);
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}

/* =========================================================
   排版更新
========================================================= */
.outline-panel-row {
  display: flex;
  align-items: center;
  position: relative;
  min-height: 26px; 
  padding: 0 10px 0 0; /* 左侧边距交由动态计算的 indent div 处理 */
  border-radius: 4px;
  margin: 1px 0;
  cursor: pointer;
  user-select: none;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.3;
  transition: none; 
}

.outline-panel-row:hover {
  background: var(--sidebar-item-hover);
  color: var(--text-primary);
}

.outline-panel-row.is-active {
  background: var(--list-active-bg);
  color: var(--list-active-fg);
  font-weight: 600;
}

.outline-panel-row.is-active .outline-panel-kind {
  color: var(--list-active-fg);
  opacity: 0.9;
}

/* 缩进与树状参考线 (Tree Guides) */
.outline-indent {
  display: flex;
  height: 100%;
  flex-shrink: 0;
}

.outline-guide {
  width: 12px; /* 和上面的 INDENT_STEP 对应 */
  height: 100%;
  border-left: 1px solid color-mix(in srgb, var(--border) 35%, transparent);
}
/* 第一根线不需要画出来，从第二根（子级）开始画 */
.outline-guide:first-child {
  border-left: none;
}

.outline-panel-kind {
  margin-right: 8px;
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.outline-panel-item-toggle {
  width: 16px;
  height: 16px;
  margin-right: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
}

.outline-panel-item-toggle:hover {
  background: var(--sidebar-item-hover);
  color: var(--text-primary);
}

.outline-panel-item-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}

.outline-panel-item-toggle--placeholder {
  pointer-events: none;
  opacity: 0;
}

.outline-panel-item-chevron {
  transition: transform 120ms ease;
}

.outline-panel-item-toggle.is-collapsed .outline-panel-item-chevron {
  transform: rotate(0deg);
}

.outline-panel-item-toggle:not(.is-collapsed) .outline-panel-item-chevron {
  transform: rotate(90deg);
}
</style>