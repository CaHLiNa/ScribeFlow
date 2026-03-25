<template>
  <div class="flex flex-col h-full" :class="embedded ? 'pt-0' : 'pt-2'" style="background: var(--bg-primary);">

    <!-- Content -->
      
      <!-- Empty state -->
      <div v-if="!hasOutlineSupport" class="flex-1 flex items-center justify-center px-4">
        <div class="text-center ui-text-xs" style="color: var(--fg-muted);">
          <div class="mb-1">{{ t('No outline') }}</div>
          <div class="ui-text-micro" style="opacity: 0.6;">{{ t('Add headings to your document to create an outline.') }}</div>
        </div>
      </div>


      <div v-else-if="groupedOutlineSections.length === 0" class="px-3 py-3 ui-text-xs" style="color: var(--fg-muted);">
        {{ t('No headings') }}
      </div>
      <div v-else class="flex-1 overflow-y-auto py-1">
        <div
          v-for="section in groupedOutlineSections"
          :key="section.key"
          class="mb-2 last:mb-0"
        >
          <div
            class="px-2 pt-1 pb-1 uppercase tracking-wide"
            style="color: var(--fg-muted); font-size: 11px; font-weight: 600;"
          >
            {{ section.title }}
          </div>
          <div
            v-for="item in section.items"
            :key="outlineItemKey(item)"
            class="flex items-center py-0.5 px-2 cursor-pointer select-none rounded-sm hover:bg-[var(--bg-hover)]"
            :class="{ 'bg-[var(--bg-hover)]': outlineItemKey(item) === activeOutlineItemKey }"
            :style="{
              paddingLeft: getOutlineItemPadding(section.key, item) + 'px',
              color: outlineItemKey(item) === activeOutlineItemKey ? 'var(--fg-primary)' : 'var(--fg-secondary)',
              fontSize: 'var(--ui-font-caption)',
              lineHeight: '1.25',
            }"
            @click="navigateToOutlineItem(item)"
          >
            <span
              v-if="getOutlineKindLabel(item.kind)"
              class="shrink-0 mr-2 uppercase tracking-wide"
              style="color: var(--fg-muted); font-size: 11px; font-weight: 600;"
            >
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
import { useLinksStore, parseHeadings } from '../../stores/links'
import { isMarkdown, isLatex, isTypst, getViewerType } from '../../utils/fileTypes'
import {
  subscribeTinymistDocumentSymbols,
} from '../../services/tinymist/session'
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
const linksStore = useLinksStore()
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
  if (vt === 'notebook') return 'notebook'
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
const activeFile = computed(() => resolveOutlinePath(props.overrideActiveFile || editorStore.activeTab))

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
      { loaded: true, tinymistBacked: true },
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

  if (ft === 'notebook') {
    const content = filesStore.fileContents[path]
    if (!content) return []
    return parseNotebookHeadings(content)
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
  return OUTLINE_SECTION_KEYS
    .map(section => {
      const items = outlineItems.value.filter(item => outlineSectionKeyForItem(item) === section.key)
      return {
        ...section,
        title: t(section.titleKey),
        items,
      }
    })
    .filter(section => section.items.length > 0)
})

const visibleOutlineItems = computed(() => outlineItems.value.filter(item => outlineSectionKeyForItem(item)))

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
const LATEX_LEVELS = { part: 1, chapter: 2, section: 3, subsection: 4, subsubsection: 5, paragraph: 6 }

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
  const baseLevel = result.length > 0
    ? Math.min(...result.map(item => item.rawLevel))
    : 1

  return result.map(item => ({
    text: item.text,
    level: Math.max(1, item.rawLevel - baseLevel + 1),
    displayLevel: Math.max(1, item.rawLevel - baseLevel + 1),
    offset: item.offset,
  }))
}

function parseNotebookHeadings(content) {
  let nb
  try { nb = JSON.parse(content) } catch { return [] }
  if (!nb.cells) return []

  const result = []
  let charOffset = 0
  for (let ci = 0; ci < nb.cells.length; ci++) {
    const cell = nb.cells[ci]
    if (cell.cell_type === 'markdown') {
      const src = Array.isArray(cell.source) ? cell.source.join('') : (cell.source || '')
      const re = /^(#{1,6})\s+(.+)$/gm
      let m
      while ((m = re.exec(src)) !== null) {
        result.push({
          text: m[2].trim(),
          level: m[1].length,
          offset: charOffset + m.index,
          cellIndex: ci,
        })
      }
    }
    const cellSrc = Array.isArray(cell.source) ? cell.source.join('') : (cell.source || '')
    charOffset += cellSrc.length + 1
  }
  return result
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

  if (ft === 'notebook') {
    if (item.cellIndex != null) {
      window.dispatchEvent(new CustomEvent('notebook-scroll-to-cell', {
        detail: { path, cellIndex: item.cellIndex },
      }))
    }
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
  () => [activeFile.value, fileType.value, filesStore.fileContents[activeFile.value || ''] || '', workspaceStore.path],
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
  { immediate: true },
)

onUnmounted(() => {
  if (cleanupTinymistSymbols) {
    cleanupTinymistSymbols()
    cleanupTinymistSymbols = null
  }
})
</script>
