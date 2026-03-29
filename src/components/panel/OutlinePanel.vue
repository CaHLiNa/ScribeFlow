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
      <div v-for="section in groupedOutlineSections" :key="section.key" class="mb-2 last:mb-0">
        <div class="outline-panel-section-label">
          {{ section.title }}
        </div>
        <div
          v-for="item in section.items"
          :key="outlineItemKey(item)"
          class="outline-panel-row"
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
import { useTypstStore } from '../../stores/typst'
import { useWorkspaceStore } from '../../stores/workspace'
import { isMarkdown, isLatex, isTypst, getViewerType } from '../../utils/fileTypes'
import { subscribeTinymistDocumentSymbols } from '../../services/tinymist/session'
import { normalizeTinymistDocumentSymbols } from '../../services/tinymist/symbols'
import { buildTypstOutlineItems, buildTypstProjectOutlineItems } from '../../services/typst/outline'
import { buildLatexOutlineItems } from '../../services/latex/outline'
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
const typstStore = useTypstStore()
const workspaceStore = useWorkspaceStore()
const { t } = useI18n()
const typstOutlineItems = ref([])
const typstOutlineLoaded = ref(false)
const latexOutlineItems = ref([])
const latexOutlineLoaded = ref(false)
const OUTLINE_SECTION_KEYS = [
  { key: 'contents', titleKey: 'Contents' },
  { key: 'figures', titleKey: 'Figures and tables' },
  { key: 'bibliography', titleKey: 'Bibliography' },
]

let cleanupTinymistSymbols = null
let typstOutlineRequestId = 0
let latexOutlineRequestId = 0

function outlineTypeForPath(path) {
  if (!path) return null
  const vt = getViewerType(path)
  if (vt === 'text' && isMarkdown(path)) return 'markdown'
  if (vt === 'text' && isLatex(path)) return 'latex'
  if (vt === 'text' && isTypst(path)) return 'typst'
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

function currentDocumentText(path) {
  const view = editorStore.getAnyEditorView(path)
  if (view) {
    return view.state.doc.toString()
  }
  return filesStore.fileContents[path] || ''
}

function bindTinymistOutline(path) {
  if (cleanupTinymistSymbols) {
    cleanupTinymistSymbols()
    cleanupTinymistSymbols = null
  }

  if (!path) return

  cleanupTinymistSymbols = subscribeTinymistDocumentSymbols(path, (symbols) => {
    typstStore.setTinymistOutlineItems(
      path,
      normalizeTinymistDocumentSymbols(currentDocumentText(path), symbols),
      { loaded: true, tinymistBacked: true }
    )
    if (activeFile.value === path && fileType.value === 'typst') {
      void loadTypstOutline(path)
    }
  })
}

function resetTypstOutline() {
  typstOutlineLoaded.value = false
  typstOutlineItems.value = []
}

async function loadTypstOutline(path) {
  const requestId = ++typstOutlineRequestId
  resetTypstOutline()
  if (!path) return

  try {
    const items = await buildTypstProjectOutlineItems(path, {
      filesStore,
      workspacePath: workspaceStore.path,
      documentText: currentDocumentText(path),
      liveState: typstStore.liveStateForFile(path),
      contentOverrides: {
        [path]: currentDocumentText(path),
      },
    })
    if (typstOutlineRequestId !== requestId) return
    typstOutlineItems.value = items
  } catch (error) {
    if (typstOutlineRequestId !== requestId) return
    console.warn('[outline] failed to build Typst outline:', error)
    typstOutlineItems.value = []
  } finally {
    if (typstOutlineRequestId === requestId) {
      typstOutlineLoaded.value = true
    }
  }
}

function resetLatexOutline() {
  latexOutlineLoaded.value = false
  latexOutlineItems.value = []
}

async function loadLatexOutline(path) {
  const requestId = ++latexOutlineRequestId
  resetLatexOutline()
  if (!path) return

  try {
    const items = await buildLatexOutlineItems(path, {
      filesStore,
      workspacePath: workspaceStore.path,
      contentOverrides: {
        [path]: currentDocumentText(path),
      },
    })
    if (latexOutlineRequestId !== requestId) return
    latexOutlineItems.value = items
  } catch (error) {
    if (latexOutlineRequestId !== requestId) return
    console.warn('[outline] failed to build LaTeX outline:', error)
    latexOutlineItems.value = []
  } finally {
    if (latexOutlineRequestId === requestId) {
      latexOutlineLoaded.value = true
    }
  }
}

// Extract headings based on file type
const outlineItems = computed(() => {
  const path = activeFile.value
  if (!path || !fileType.value) return []

  const ft = fileType.value

  if (ft === 'markdown') {
    const content = currentDocumentText(path)
    if (!content) return []
    return buildMarkdownOutlineItems(content)
  }

  if (ft === 'latex') {
    if (latexOutlineLoaded.value) {
      return latexOutlineItems.value
    }
    const content = filesStore.fileContents[path]
    if (!content) return []
    return parseLatexHeadings(content)
  }

  if (ft === 'typst') {
    if (typstOutlineLoaded.value) {
      return typstOutlineItems.value
    }
    const content = currentDocumentText(path)
    if (!content) return []
    return buildTypstOutlineItems(content, {
      liveState: typstStore.liveStateForFile(path),
    })
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

  if (ft === 'markdown' || ft === 'latex' || ft === 'typst') {
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
  if (sectionKey !== 'contents') return 8
  const displayLevel = Math.max(1, Number(item.displayLevel || item.level) || 1)
  return (displayLevel - 1) * 12 + 8
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
  () => [
    activeFile.value,
    fileType.value,
    filesStore.fileContents[activeFile.value || ''] || '',
    workspaceStore.path,
  ],
  ([path, ft]) => {
    if (ft === 'typst') {
      bindTinymistOutline(path)
      void loadTypstOutline(path)
      resetLatexOutline()
      return
    }

    if (ft === 'latex') {
      if (cleanupTinymistSymbols) {
        cleanupTinymistSymbols()
        cleanupTinymistSymbols = null
      }
      resetTypstOutline()
      void loadLatexOutline(path)
      return
    }

    if (cleanupTinymistSymbols) {
      cleanupTinymistSymbols()
      cleanupTinymistSymbols = null
    }
    resetTypstOutline()
    resetLatexOutline()
  },
  { immediate: true }
)

onUnmounted(() => {
  if (cleanupTinymistSymbols) {
    cleanupTinymistSymbols()
    cleanupTinymistSymbols = null
  }
})
</script>

<style scoped>
.outline-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: transparent;
  padding-top: 2px;
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
  font-size: var(--sidebar-font-body);
  line-height: 1.55;
  color: var(--text-muted);
}

.outline-panel-empty-title {
  font-size: var(--sidebar-font-item);
  line-height: 1.35;
}

.outline-panel-empty-hint {
  margin-top: 4px;
  font-size: var(--sidebar-font-meta);
  line-height: 1.45;
  opacity: 0.7;
}

.outline-panel-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 2px 0 6px;
}

.outline-panel-section-label {
  padding: 6px 8px 3px;
  font-size: var(--ui-font-tiny);
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  opacity: 0.68;
}

.outline-panel-row {
  display: flex;
  align-items: center;
  position: relative;
  min-height: 24px;
  padding: 2px 8px 2px 12px;
  border-radius: 7px;
  cursor: pointer;
  user-select: none;
  color: var(--text-secondary);
  font-size: var(--sidebar-font-item);
  line-height: 1.25;
  opacity: 0.9;
  transition:
    background-color 140ms ease,
    color 140ms ease,
    box-shadow 140ms ease,
    opacity 140ms ease;
}

.outline-panel-row::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 6px;
  bottom: 6px;
  width: 2px;
  border-radius: 999px;
  background: transparent;
  opacity: 0;
  transition:
    background-color 140ms ease,
    opacity 140ms ease;
}

.outline-panel-row:hover {
  background: color-mix(in srgb, var(--text-primary) 4%, transparent);
  opacity: 1;
}

.outline-panel-row.is-active {
  background: transparent;
  color: var(--text-primary);
  opacity: 1;
}

.outline-panel-row.is-active::before {
  background: color-mix(in srgb, var(--accent) 64%, transparent);
  opacity: 1;
}

.outline-panel-kind {
  margin-right: 8px;
  flex-shrink: 0;
  font-size: var(--ui-font-tiny);
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  opacity: 0.76;
}
</style>
