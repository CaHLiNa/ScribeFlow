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

    <div v-else-if="groupedOutlineSections.length === 0" class="outline-panel-empty-copy px-3 py-3">
      {{ t('No headings') }}
    </div>

    <div v-else class="outline-panel-scroll">
      <div v-for="section in groupedOutlineSections" :key="section.key" class="mb-1 last:mb-0">
        <div class="outline-panel-section-label">
          {{ section.title }}
        </div>
        <div
          v-for="item in section.items"
          :key="outlineItemKey(item)"
          class="outline-panel-row ui-list-row"
          :class="{ 'is-active': outlineItemKey(item) === activeOutlineItemKey }"
          :style="{ paddingLeft: getOutlineItemPadding(section.key, item) + 'px' }"
          @click="navigateToOutlineItem(item)"
        >
          <span v-if="getOutlineKindLabel(item.kind)" class="outline-panel-kind">
            {{ getOutlineKindLabel(item.kind) }}
          </span>
          <span class="truncate">{{ item.text }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useFilesStore } from '../../stores/files'
import { isMarkdown, isLatex, getViewerType } from '../../utils/fileTypes'
import { buildMarkdownOutlineItems } from '../../services/markdown/outline'
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
const OUTLINE_SECTION_KEYS = [
  { key: 'contents', titleKey: 'Contents' },
  { key: 'figures', titleKey: 'Figures and tables' },
  { key: 'bibliography', titleKey: 'Bibliography' },
]

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
  if (outlineTypeForPath(sourcePath)) {
    return sourcePath
  }

  return path
}

// Determine if active file supports outline
// Use overrideActiveFile prop when provided (e.g., from right sidebar when chat tab is focused)
const activeFile = computed(() =>
  resolveOutlinePath(props.overrideActiveFile || editorStore.activeTab)
)

const fileType = computed(() => {
  return outlineTypeForPath(activeFile.value)
})

const hasOutlineSupport = computed(() => fileType.value !== null)
const markdownOutlineItems = ref([])
let markdownOutlineRequestId = 0

function currentDocumentText(path) {
  const view = editorStore.getAnyEditorView(path)
  if (view) {
    return view.state.doc.toString()
  }
  return filesStore.fileContents[path] || ''
}

async function refreshMarkdownOutline() {
  const path = activeFile.value
  const content = path ? currentDocumentText(path) : ''
  const requestId = ++markdownOutlineRequestId

  if (!path || fileType.value !== 'markdown' || !content) {
    if (requestId === markdownOutlineRequestId) {
      markdownOutlineItems.value = []
    }
    return
  }

  try {
    const items = await buildMarkdownOutlineItems(content)
    if (requestId === markdownOutlineRequestId && activeFile.value === path) {
      markdownOutlineItems.value = Array.isArray(items) ? items : []
    }
  } catch {
    if (requestId === markdownOutlineRequestId) {
      markdownOutlineItems.value = []
    }
  }
}

const outlineItems = computed(() => {
  const path = activeFile.value
  const ft = fileType.value
  if (!path || !ft) return []

  if (ft === 'markdown') {
    return markdownOutlineItems.value
  }

  if (ft === 'latex') {
    const content = currentDocumentText(path)
    return content ? parseLatexHeadings(content) : []
  }

  return []
})

function outlineSectionKeyForItem(item = {}) {
  if (item.kind === 'heading' || item.kind === 'appendix') return 'contents'
  if (item.kind === 'figure' || item.kind === 'table') return 'figures'
  if (item.kind === 'bibliography') return 'bibliography'
  return null
}

const groupedOutlineSections = computed(() => {
  return OUTLINE_SECTION_KEYS.map((section) => {
    const items = outlineItems.value.filter(
      (item) => outlineSectionKeyForItem(item) === section.key
    )
    return {
      ...section,
      title: t(section.titleKey),
      items,
    }
  }).filter((section) => section.items.length > 0)
})

const visibleOutlineItems = computed(() =>
  outlineItems.value.filter((item) => outlineSectionKeyForItem(item))
)

// Current heading highlight (for CM6 files)
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

// --- Heading parsers ---

const LATEX_SECTION_RE = /^\\(part|chapter|section|subsection|subsubsection|paragraph)\{([^}]*)\}/gm
const LATEX_LEVELS = {
  part: 1,
  chapter: 2,
  section: 3,
  subsection: 4,
  subsubsection: 5,
  paragraph: 6,
}

function parseLatexHeadings(content) {
  const result = []
  let m
  LATEX_SECTION_RE.lastIndex = 0
  while ((m = LATEX_SECTION_RE.exec(content)) !== null) {
    result.push({
      text: m[2].trim(),
      rawLevel: LATEX_LEVELS[m[1]] || 3,
      offset: m.index,
    })
  }
  const baseLevel = result.length > 0 ? Math.min(...result.map((item) => item.rawLevel)) : 1

  return result.map((item) => ({
    kind: 'heading',
    text: item.text,
    level: Math.max(1, item.rawLevel - baseLevel + 1),
    displayLevel: Math.max(1, item.rawLevel - baseLevel + 1),
    offset: item.offset,
  }))
}

// --- Navigation ---

function focusTextOffset(path, offset, attempts = 0) {
  const targetView = editorStore.getAnyEditorView(path)
  if (!targetView) {
    if (attempts < 20) {
      window.setTimeout(() => focusTextOffset(path, offset, attempts + 1), 40)
    }
    return
  }

  const pos = Math.min(Number(offset) || 0, targetView.state.doc.length)
  targetView.dispatch({
    selection: { anchor: pos },
    scrollIntoView: true,
  })
  targetView.focus()
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

function getOutlineItemPadding(sectionKey, item = {}) {
  if (sectionKey !== 'contents') return 6
  const displayLevel = Math.max(1, Number(item.displayLevel || item.level) || 1)
  return (displayLevel - 1) * 8 + 6
}

function outlineItemKey(item = {}) {
  return [
    item.filePath || activeFile.value || '',
    item.offset || 0,
    item.kind || 'heading',
    item.text || '',
  ].join('::')
}

watch(
  () => [activeFile.value, fileType.value, currentDocumentText(activeFile.value || '')],
  () => {
    void refreshMarkdownOutline()
  },
  { immediate: true }
)

onUnmounted(() => {})
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
  padding: 0 4px 4px;
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

.outline-panel-section-label {
  padding: 6px 10px 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* =========================================================
   完全对齐 FileTree 的 macOS 原生列表样式 
========================================================= */
.outline-panel-row {
  display: flex;
  align-items: center;
  position: relative;
  min-height: 26px; /* 统一行高 */
  padding: 0 10px 0 12px;
  border-radius: 4px; /* 统一圆角 */
  margin: 1px 0;
  cursor: pointer;
  user-select: none;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.3;
  transition: none; /* 原生无过渡 */
}

.outline-panel-row:hover {
  background: var(--sidebar-item-hover);
  color: var(--text-primary);
}

/* 移除之前的发光描边、前置点等杂乱设计，直接使用原生强色铺满 */
.outline-panel-row.is-active {
  background: var(--list-active-bg);
  color: var(--list-active-fg);
  font-weight: 600;
}

.outline-panel-row.is-active .outline-panel-kind {
  color: var(--list-active-fg);
  opacity: 0.9;
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
</style>
