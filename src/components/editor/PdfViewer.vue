<template>
  <div class="h-full flex flex-col overflow-hidden">
    <Teleport :to="toolbarTargetSelector || 'body'" :disabled="!toolbarTargetSelector">
      <div v-if="!error" class="pdf-toolbar-wrap" :class="{ 'pdf-toolbar-wrap-embedded': !!toolbarTargetSelector }">
        <div class="pdf-toolbar">
          <div class="pdf-toolbar-left">
            <div class="pdf-toolbar-group">
              <button
                class="pdf-toolbar-btn"
                :class="{ 'pdf-toolbar-btn-active': pdfUi.sidebarOpen }"
                :disabled="!pdfUi.ready || !sidebarAvailable"
                :title="t('Toggle sidebar')"
                @click="toggleSidebar"
              >
                <component :is="sidebarIcon" :size="14" :stroke-width="1.6" />
              </button>
            </div>

            <div class="pdf-toolbar-separator"></div>

            <div class="pdf-toolbar-group">
              <button
                class="pdf-toolbar-btn"
                :disabled="!pdfUi.ready || !pdfUi.canGoPrevious"
                :title="t('Previous page')"
                @click="goPreviousPage"
              >
                <IconChevronUp :size="13" :stroke-width="1.8" />
              </button>
              <button
                class="pdf-toolbar-btn"
                :disabled="!pdfUi.ready || !pdfUi.canGoNext"
                :title="t('Next page')"
                @click="goNextPage"
              >
                <IconChevronDown :size="13" :stroke-width="1.8" />
              </button>
              <div class="pdf-page-indicator">
                <input
                  ref="pageInputRef"
                  v-model="pageInput"
                  class="pdf-toolbar-input pdf-page-input"
                  type="text"
                  inputmode="numeric"
                  spellcheck="false"
                  :disabled="!pdfUi.ready"
                  @keydown.enter.prevent="commitPageNumber"
                  @blur="commitPageNumber"
                />
                <span class="pdf-toolbar-label">/ {{ pdfUi.pagesCount || 0 }}</span>
              </div>
            </div>
          </div>

          <div class="pdf-toolbar-center">
            <div class="pdf-toolbar-group pdf-toolbar-group-scale">
              <button
                class="pdf-toolbar-btn"
                :disabled="!pdfUi.ready || !pdfUi.canZoomOut"
                :title="t('Zoom out')"
                @click="zoomOut"
              >
                <IconMinus :size="13" :stroke-width="1.8" />
              </button>
              <button
                class="pdf-toolbar-btn"
                :disabled="!pdfUi.ready || !pdfUi.canZoomIn"
                :title="t('Zoom in')"
                @click="zoomIn"
              >
                <IconPlus :size="13" :stroke-width="1.8" />
              </button>
              <select
                v-model="pdfUi.scaleValue"
                class="pdf-toolbar-select"
                :disabled="!pdfUi.ready || scaleOptions.length === 0"
                @change="applyScale"
              >
                <option
                  v-for="option in scaleOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>

          <div class="pdf-toolbar-right">
            <div v-if="pendingSelection" class="pdf-toolbar-group">
              <button
                class="pdf-annotation-btn"
                :title="t('Save the current PDF selection as an annotation')"
                @mousedown.prevent
                @click="createAnnotationFromSelection"
              >
                <span>{{ t('Add highlight') }}</span>
              </button>
            </div>

            <div class="pdf-toolbar-group pdf-toolbar-group-translate">
              <span
                v-if="translateStatus"
                class="pdf-translate-status"
                :title="translateTask?.message || ''"
                :style="{ color: translateStatusColor }"
              >
                {{ translateStatus }}
              </span>
              <button
                class="pdf-translate-btn"
                :disabled="translateTask?.status === 'running'"
                :style="{ color: translateTask?.status === 'failed' ? 'var(--error)' : 'var(--accent)' }"
                :title="t('Translate this PDF')"
                @click="translatePdf"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M2.5 3.5h11v9h-11z"/>
                  <path d="M5 6.5h1.5M5 9h4"/>
                  <path d="M9.5 5.75l2 4.5M10 9.25h3"/>
                </svg>
                <span>{{ translateTask?.status === 'running' ? t('Translating...') : t('Translate') }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <div class="relative flex-1 overflow-hidden">
      <div class="pdf-reader-shell">
        <div class="pdf-stage-shell">
          <div
            ref="viewerContainerRef"
            class="pdf-stage altals-pdf-stage"
            @dblclick="handleViewerDoubleClick"
            @mouseup="handleViewerMouseUp"
          >
            <div ref="viewerRef" class="pdfViewer"></div>
          </div>
        </div>

        <Transition name="pdf-sidebar-overlay">
          <aside
            v-if="pdfUi.sidebarOpen"
            class="pdf-sidebar-shell"
          >
            <div class="pdf-sidebar-header">
              <button
                type="button"
                class="pdf-sidebar-tab"
                :class="{ 'pdf-sidebar-tab-active': pdfUi.sidebarMode === 'outline' }"
                :disabled="!pdfUi.outlineSupported && !outlineLoading"
                @click="selectSidebarMode('outline')"
              >
                {{ t('Outline') }}
              </button>
              <button
                type="button"
                class="pdf-sidebar-tab"
                :class="{ 'pdf-sidebar-tab-active': pdfUi.sidebarMode === 'pages' }"
                :disabled="!pdfUi.pagesSupported"
                @click="selectSidebarMode('pages')"
              >
                {{ t('Page View') }}
              </button>
              <button
                type="button"
                class="pdf-sidebar-tab"
                :class="{ 'pdf-sidebar-tab-active': pdfUi.sidebarMode === 'annotations' }"
                :disabled="!pdfUi.pagesSupported"
                @click="selectSidebarMode('annotations')"
              >
                {{ t('Highlights') }}
              </button>
            </div>

            <div
              v-if="pdfUi.sidebarMode === 'outline'"
              class="pdf-outline-list"
            >
              <div
                v-if="outlineLoading"
                class="pdf-outline-empty"
              >
                {{ t('Loading PDF...') }}
              </div>
              <div
                v-else-if="outlineItems.length === 0"
                class="pdf-outline-empty"
              >
                {{ t('No outline') }}
              </div>
              <button
                v-for="item in outlineItems"
                :key="item.id"
                type="button"
                class="pdf-outline-item"
                :style="{
                  paddingLeft: `${12 + item.depth * 14}px`,
                  fontWeight: item.bold ? 600 : 500,
                  fontStyle: item.italic ? 'italic' : 'normal',
                }"
                :title="item.title"
                @click="activateOutlineItem(item)"
              >
                <span class="pdf-outline-item-title">{{ item.title }}</span>
              </button>
            </div>

            <div
              v-else-if="pdfUi.sidebarMode === 'pages'"
              ref="sidebarScrollRef"
              class="pdf-page-list"
            >
              <button
                v-for="thumbnail in pageThumbnails"
                :key="thumbnail.pageNumber"
                :ref="el => setThumbnailItemRef(thumbnail.pageNumber, el)"
                type="button"
                class="pdf-page-item"
                :class="{ 'pdf-page-item-active': thumbnail.pageNumber === pdfUi.pageNumber }"
                :data-page-number="thumbnail.pageNumber"
                :title="t('Page {page}', { page: thumbnail.pageNumber })"
                @click="activatePageThumbnail(thumbnail.pageNumber)"
              >
                <div
                  class="pdf-page-thumb"
                  :style="thumbnailPreviewStyle(thumbnail)"
                >
                  <img
                    v-if="thumbnail.imageSrc"
                    class="pdf-page-thumb-image"
                    :src="thumbnail.imageSrc"
                    :alt="t('Page {page}', { page: thumbnail.pageNumber })"
                  />
                  <div
                    v-else-if="thumbnail.status === 'error'"
                    class="pdf-page-thumb-fallback"
                  >
                    {{ t('Preview unavailable') }}
                  </div>
                  <div
                    v-else
                    class="pdf-page-thumb-skeleton"
                  ></div>
                </div>
                <div class="pdf-page-label">{{ t('Page {page}', { page: thumbnail.pageNumber }) }}</div>
              </button>
            </div>

            <div
              v-else
              class="pdf-annotation-list"
            >
              <div v-if="pendingSelection" class="pdf-annotation-pending">
                <div class="pdf-annotation-pending-label">{{ t('Selection ready') }}</div>
                <div class="pdf-annotation-pending-quote">{{ pendingSelection.quote }}</div>
                <button
                  type="button"
                  class="pdf-annotation-primary"
                  @mousedown.prevent
                  @click="createAnnotationFromSelection"
                >
                  {{ t('Create highlight on page {page}', { page: pendingSelection.page }) }}
                </button>
              </div>

              <div
                v-if="currentPdfAnnotations.length === 0"
                class="pdf-annotation-empty"
              >
                <div>{{ t('No highlights yet') }}</div>
                <div class="pdf-annotation-empty-hint">
                  {{ t('Select text in the PDF, then save it as a highlight.') }}
                </div>
              </div>

              <div
                v-for="annotation in currentPdfAnnotations"
                v-else
                :key="annotation.id"
                class="pdf-annotation-item"
                tabindex="0"
                :class="{ 'pdf-annotation-item-active': annotation.id === activeAnnotationId }"
                @click="focusAnnotation(annotation)"
                @keydown.enter.prevent="focusAnnotation(annotation)"
              >
                <div class="pdf-annotation-item-header">
                  <span class="pdf-annotation-page">{{ t('Page {page}', { page: annotation.page }) }}</span>
                  <span class="pdf-annotation-date">{{ formatAnnotationTimestamp(annotation.updatedAt || annotation.createdAt) }}</span>
                </div>
                <div class="pdf-annotation-quote">{{ annotation.quote }}</div>
                <div class="pdf-annotation-actions">
                  <span class="pdf-annotation-open">{{ t('Jump to quote') }}</span>
                  <button
                    type="button"
                    class="pdf-annotation-delete"
                    :title="t('Delete highlight')"
                    @click.stop="deleteAnnotation(annotation)"
                  >
                    {{ t('Delete') }}
                  </button>
                </div>
                <div class="pdf-annotation-note-shell" @click.stop>
                  <button
                    v-if="!noteForAnnotation(annotation.id)"
                    type="button"
                    class="pdf-annotation-note-create"
                    @click="createNoteFromAnnotation(annotation)"
                  >
                    {{ t('Create note') }}
                  </button>
                  <ResearchNoteCard
                    v-else
                    :note="noteForAnnotation(annotation.id)"
                    :annotation="annotation"
                    :is-active="noteForAnnotation(annotation.id)?.id === activeNoteId"
                    @update-comment="updateNoteComment(noteForAnnotation(annotation.id), $event)"
                    @insert="insertNoteIntoManuscript(annotation)"
                    @delete="deleteNote(noteForAnnotation(annotation.id))"
                  />
                </div>
              </div>
            </div>
          </aside>
        </Transition>
      </div>

      <div
        v-if="loading"
        class="absolute inset-0 flex items-center justify-center text-sm"
        style="color: var(--fg-muted); background: var(--bg-primary);"
      >
        {{ t('Loading PDF...') }}
      </div>
      <div
        v-else-if="error"
        class="absolute inset-0 flex items-center justify-center px-6 text-sm"
        style="color: var(--fg-muted); background: var(--bg-primary);"
      >
        <div class="max-w-xl text-center">
          <div>{{ t('Could not load PDF') }}</div>
          <div v-if="error" class="mt-2 text-xs" style="word-break: break-word;">{{ error }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, toRef, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  IconChevronDown,
  IconChevronUp,
  IconMinus,
  IconPlus,
} from '@tabler/icons-vue'
import 'pdfjs-dist/legacy/web/pdf_viewer.css'
import { useI18n } from '../../i18n'
import { usePdfTranslateStore } from '../../stores/pdfTranslate'
import { useToastStore } from '../../stores/toast'
import { useWorkspaceStore } from '../../stores/workspace'
import { useResearchArtifactsStore } from '../../stores/researchArtifacts'
import { useEditorStore } from '../../stores/editor'
import { usePdfViewerSession } from '../../composables/usePdfViewerSession'
import { createPdfQuoteAnchor } from '../../services/pdfAnchors'
import ResearchNoteCard from './ResearchNoteCard.vue'

const emit = defineEmits(['dblclick-page'])

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
  toolbarTargetSelector: { type: String, default: '' },
  referenceKey: { type: String, default: '' },
})

const workspace = useWorkspaceStore()
const pdfTranslateStore = usePdfTranslateStore()
const toastStore = useToastStore()
const researchArtifactsStore = useResearchArtifactsStore()
const editorStore = useEditorStore()
const { t } = useI18n()
const filePathRef = toRef(props, 'filePath')

const viewerContainerRef = ref(null)
const viewerRef = ref(null)
const sidebarScrollRef = ref(null)
const pageInputRef = ref(null)

const {
  pageInput,
  loading,
  error,
  outlineItems,
  outlineLoading,
  pageThumbnails,
  pdfUi,
  sidebarIcon,
  sidebarAvailable,
  scaleOptions,
  selectSidebarMode,
  toggleSidebar,
  activateOutlineItem,
  activatePageThumbnail,
  goPreviousPage,
  goNextPage,
  commitPageNumber,
  zoomOut,
  zoomIn,
  applyScale,
  setThumbnailItemRef,
  thumbnailPreviewStyle,
  scrollToPage,
  scrollToLocation,
  convertPageOffsetToSyncTexPoint,
} = usePdfViewerSession({
  filePathRef,
  viewerContainerRef,
  viewerRef,
  sidebarScrollRef,
  pageInputRef,
  workspace,
  t,
})

const currentPdfAnnotations = computed(() => (
  filePathRef.value ? researchArtifactsStore.annotationsForPdf(filePathRef.value) : []
))
const activeAnnotationId = computed(() => researchArtifactsStore.activeAnnotationId || null)
const activeNoteId = computed(() => researchArtifactsStore.activeNoteId || null)
const pendingSelection = ref(null)

const translateTask = computed(() => (
  filePathRef.value ? pdfTranslateStore.latestTaskForInput(filePathRef.value) : null
))
const translateStatus = computed(() => {
  const task = translateTask.value
  if (!task) return ''
  if (task.status === 'running') {
    const pct = Number.isFinite(task.progress) ? Math.round(task.progress) : 0
    return `${pct}%`
  }
  if (task.status === 'completed') return t('Ready')
  if (task.status === 'failed') return t('Failed')
  if (task.status === 'canceled') return t('Canceled')
  return ''
})
const translateStatusColor = computed(() => {
  const status = translateTask.value?.status
  if (status === 'completed') return 'var(--success, #4ade80)'
  if (status === 'failed') return 'var(--error)'
  if (status === 'running') return 'var(--accent)'
  return 'var(--fg-muted)'
})

let annotationRenderScheduled = false
let annotationMutationObserver = null

function normalizeSelectionText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function roundRectValue(value) {
  return Math.round(Number(value || 0) * 10000) / 10000
}

function resolvePageElement(node) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement
  return element?.closest?.('.page[data-page-number]') || null
}

function normalizeRectToPage(clientRect, pageRect) {
  const pageWidth = Math.max(Number(pageRect?.width || 0), 1)
  const pageHeight = Math.max(Number(pageRect?.height || 0), 1)
  const left = Math.max(0, Number(clientRect?.left || 0) - pageRect.left)
  const top = Math.max(0, Number(clientRect?.top || 0) - pageRect.top)
  const right = Math.min(pageWidth, Number(clientRect?.right || 0) - pageRect.left)
  const bottom = Math.min(pageHeight, Number(clientRect?.bottom || 0) - pageRect.top)
  const width = right - left
  const height = bottom - top

  if (width < 1 || height < 1) return null

  return {
    left: roundRectValue(left / pageWidth),
    top: roundRectValue(top / pageHeight),
    width: roundRectValue(width / pageWidth),
    height: roundRectValue(height / pageHeight),
  }
}

function extractQuoteContext(pageText, quote) {
  const normalizedPageText = normalizeSelectionText(pageText)
  const normalizedQuote = normalizeSelectionText(quote)
  if (!normalizedPageText || !normalizedQuote) {
    return { prefix: '', suffix: '' }
  }

  const quoteIndex = normalizedPageText.indexOf(normalizedQuote)
  if (quoteIndex === -1) {
    return { prefix: '', suffix: '' }
  }

  const prefixStart = Math.max(0, quoteIndex - 120)
  const suffixStart = quoteIndex + normalizedQuote.length

  return {
    prefix: normalizedPageText.slice(prefixStart, quoteIndex).trim(),
    suffix: normalizedPageText.slice(suffixStart, suffixStart + 120).trim(),
  }
}

function buildSelectionRect(range, pageElement, pageNumber) {
  const pageRect = pageElement?.getBoundingClientRect?.()
  if (!pageRect) return null

  const normalizedRects = Array.from(range.getClientRects())
    .map((rect) => normalizeRectToPage(rect, pageRect))
    .filter(Boolean)

  if (normalizedRects.length === 0) {
    const fallbackRect = normalizeRectToPage(range.getBoundingClientRect(), pageRect)
    if (fallbackRect) normalizedRects.push(fallbackRect)
  }

  if (normalizedRects.length === 0) return null

  const bounds = normalizedRects.reduce((acc, rect) => {
    const right = rect.left + rect.width
    const bottom = rect.top + rect.height
    return {
      left: Math.min(acc.left, rect.left),
      top: Math.min(acc.top, rect.top),
      right: Math.max(acc.right, right),
      bottom: Math.max(acc.bottom, bottom),
    }
  }, {
    left: Number.POSITIVE_INFINITY,
    top: Number.POSITIVE_INFINITY,
    right: 0,
    bottom: 0,
  })

  const pageWidth = Math.max(Number(pageRect.width || 0), 1)
  const pageHeight = Math.max(Number(pageRect.height || 0), 1)
  const localX = ((bounds.left + (bounds.right - bounds.left) / 2) * pageWidth)
  const localY = ((bounds.top + (bounds.bottom - bounds.top) / 2) * pageHeight)
  const focusPoint = convertPageOffsetToSyncTexPoint(pageNumber, localX, localY)

  return {
    rects: normalizedRects,
    bounds: {
      left: roundRectValue(bounds.left),
      top: roundRectValue(bounds.top),
      width: roundRectValue(bounds.right - bounds.left),
      height: roundRectValue(bounds.bottom - bounds.top),
    },
    focusPoint: focusPoint
      ? {
        x: focusPoint.x,
        y: focusPoint.y,
      }
      : null,
  }
}

function clearPendingSelection({ clearDomSelection = false } = {}) {
  pendingSelection.value = null
  if (!clearDomSelection) return
  try {
    window.getSelection()?.removeAllRanges?.()
  } catch {}
}

function capturePendingSelection(showFeedback = true) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    clearPendingSelection()
    return
  }

  const range = selection.getRangeAt(0)
  const commonNode = range.commonAncestorContainer?.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer?.parentElement
  if (!commonNode || !viewerContainerRef.value?.contains(commonNode)) {
    clearPendingSelection()
    return
  }

  const pageElement = resolvePageElement(range.startContainer)
  const endPageElement = resolvePageElement(range.endContainer)
  const quote = normalizeSelectionText(selection.toString())

  if (!quote) {
    clearPendingSelection()
    return
  }

  if (!pageElement || !endPageElement || pageElement !== endPageElement) {
    clearPendingSelection()
    if (showFeedback) {
      toastStore.showOnce(
        `pdf-selection:${filePathRef.value}:single-page`,
        t('Please keep PDF highlights within a single page.'),
        { type: 'error', duration: 3500 },
        5000,
      )
    }
    return
  }

  const pageNumber = Number(pageElement.dataset.pageNumber || 0)
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    clearPendingSelection()
    return
  }

  const { prefix, suffix } = extractQuoteContext(pageElement.textContent || '', quote)
  pendingSelection.value = {
    page: pageNumber,
    quote,
    prefix,
    suffix,
    selectionRect: buildSelectionRect(range, pageElement, pageNumber),
  }
}

function handleDocumentSelectionChange() {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    clearPendingSelection()
    return
  }

  const range = selection.getRangeAt(0)
  const commonNode = range.commonAncestorContainer?.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer?.parentElement
  if (!commonNode || !viewerContainerRef.value?.contains(commonNode)) {
    clearPendingSelection()
  }
}

function handleViewerMouseUp() {
  window.requestAnimationFrame(() => {
    capturePendingSelection(true)
  })
}

function openAnnotationsSidebar() {
  selectSidebarMode('annotations')
  if (!pdfUi.sidebarOpen) {
    toggleSidebar()
  }
}

function focusAnnotation(annotation) {
  if (!annotation) return
  researchArtifactsStore.setActiveAnnotation(annotation.id)
  clearPendingSelection({ clearDomSelection: true })

  const focusPoint = annotation.anchor?.selectionRect?.focusPoint
  if (Number.isFinite(focusPoint?.x) && Number.isFinite(focusPoint?.y)) {
    scrollToLocation(annotation.page, focusPoint.x, focusPoint.y)
    return
  }

  scrollToPage(annotation.page)
}

function noteForAnnotation(annotationId) {
  return researchArtifactsStore.noteForAnnotation(annotationId)
}

function createNoteFromAnnotation(annotation) {
  if (!annotation?.id) return null
  const existing = noteForAnnotation(annotation.id)
  if (existing) {
    researchArtifactsStore.setActiveNote(existing.id)
    return existing
  }

  const note = researchArtifactsStore.createResearchNote({
    sourceAnnotationId: annotation.id,
    quote: annotation.quote,
    comment: '',
    sourceRef: {
      type: 'pdf_annotation',
      annotationId: annotation.id,
      referenceKey: annotation.referenceKey || props.referenceKey || null,
      pdfPath: annotation.pdfPath || filePathRef.value,
      page: annotation.page,
    },
  })
  researchArtifactsStore.setActiveNote(note.id)
  toastStore.show(t('Created note from page {page}', { page: annotation.page }), {
    type: 'success',
    duration: 2200,
  })
  return note
}

function updateNoteComment(note, comment) {
  if (!note?.id) return
  researchArtifactsStore.updateResearchNote(note.id, { comment })
}

function deleteNote(note) {
  if (!note?.id) return
  researchArtifactsStore.removeResearchNote(note.id)
  toastStore.show(t('Note deleted'), {
    type: 'success',
    duration: 2000,
  })
}

function insertNoteIntoManuscript(annotation) {
  if (!annotation?.id) return
  const note = noteForAnnotation(annotation.id) || createNoteFromAnnotation(annotation)
  if (!note) return

  const result = editorStore.insertResearchNoteIntoManuscript(note, annotation)
  if (!result?.ok) {
    toastStore.show(
      t('Open a text or DOCX manuscript in another pane to insert this note.'),
      { type: 'error', duration: 4200 },
    )
    return
  }

  researchArtifactsStore.updateResearchNote(note.id, {
    insertedInto: {
      path: result.path,
      paneId: result.paneId,
      viewerType: result.viewerType,
      insertedAt: new Date().toISOString(),
    },
  })
  researchArtifactsStore.setActiveNote(note.id)
  toastStore.show(t('Inserted note into {name}', {
    name: result.path.split('/').pop() || result.path,
  }), {
    type: 'success',
    duration: 2600,
  })
}

function deleteAnnotation(annotation) {
  if (!annotation?.id) return
  researchArtifactsStore.removeAnnotation(annotation.id)
  toastStore.show(t('Highlight deleted'), {
    type: 'success',
    duration: 2200,
  })
  scheduleRenderAnnotationHighlights()
}

async function createAnnotationFromSelection() {
  const selection = pendingSelection.value
  if (!selection || !filePathRef.value) return

  const anchor = createPdfQuoteAnchor({
    pdfPath: filePathRef.value,
    referenceKey: props.referenceKey || null,
    page: selection.page,
    quote: selection.quote,
    prefix: selection.prefix,
    suffix: selection.suffix,
    selectionRect: selection.selectionRect,
  })

  const annotation = researchArtifactsStore.createAnnotation({
    pdfPath: filePathRef.value,
    referenceKey: props.referenceKey || null,
    page: selection.page,
    quote: selection.quote,
    anchor,
  })

  researchArtifactsStore.setActiveAnnotation(annotation.id)
  clearPendingSelection({ clearDomSelection: true })
  openAnnotationsSidebar()
  await nextTick()
  scheduleRenderAnnotationHighlights()
  focusAnnotation(annotation)
  toastStore.show(t('Saved highlight on page {page}', { page: annotation.page }), {
    type: 'success',
    duration: 2400,
  })
}

function formatAnnotationTimestamp(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function clearRenderedAnnotationHighlights() {
  viewerRef.value
    ?.querySelectorAll?.('.altals-pdf-annotation-highlight')
    ?.forEach((element) => element.remove())
}

function renderAnnotationHighlights() {
  clearRenderedAnnotationHighlights()
  if (!viewerRef.value || loading.value) return

  currentPdfAnnotations.value.forEach((annotation) => {
    const rects = annotation.anchor?.selectionRect?.rects
    if (!Array.isArray(rects) || rects.length === 0) return

    const pageNumber = Number(annotation.page || annotation.anchor?.page || 0)
    if (!Number.isInteger(pageNumber) || pageNumber < 1) return

    const pageElement = viewerRef.value.querySelector(`.page[data-page-number="${pageNumber}"]`)
    if (!pageElement) return

    rects.forEach((rect) => {
      if (
        !Number.isFinite(rect?.left) ||
        !Number.isFinite(rect?.top) ||
        !Number.isFinite(rect?.width) ||
        !Number.isFinite(rect?.height)
      ) return
      const highlight = document.createElement('div')
      highlight.className = 'altals-pdf-annotation-highlight'
      if (annotation.id === activeAnnotationId.value) {
        highlight.classList.add('altals-pdf-annotation-highlight-active')
      }
      highlight.dataset.annotationId = annotation.id
      highlight.style.left = `${rect.left * 100}%`
      highlight.style.top = `${rect.top * 100}%`
      highlight.style.width = `${rect.width * 100}%`
      highlight.style.height = `${rect.height * 100}%`
      pageElement.appendChild(highlight)
    })
  })
}

function scheduleRenderAnnotationHighlights() {
  if (annotationRenderScheduled) return
  annotationRenderScheduled = true
  window.requestAnimationFrame(() => {
    annotationRenderScheduled = false
    renderAnnotationHighlights()
  })
}

function isHighlightOnlyMutation(record) {
  const nodes = [
    ...Array.from(record.addedNodes || []),
    ...Array.from(record.removedNodes || []),
  ]
  return nodes.length > 0 && nodes.every((node) => (
    node?.nodeType === Node.ELEMENT_NODE && node.classList?.contains('altals-pdf-annotation-highlight')
  ))
}

async function translatePdf() {
  if (!filePathRef.value || translateTask.value?.status === 'running') return

  try {
    await pdfTranslateStore.startTranslation(filePathRef.value)
    const name = filePathRef.value.split('/').pop()
    toastStore.show(t('Started translating {name}', { name }), {
      type: 'success',
      duration: 2500,
    })
  } catch (translateError) {
    const message = translateError?.message || String(translateError)
    toastStore.show(message, { type: 'error', duration: 5000 })
    workspace.openSettings('pdf-translate')
  }
}

function handleViewerDoubleClick(event) {
  const pageElement = event.target?.closest?.('.page[data-page-number]')
  if (!pageElement) return

  const page = Number(pageElement.dataset.pageNumber || 0)
  const rect = pageElement.getBoundingClientRect()
  const localX = event.clientX - rect.left
  const localY = event.clientY - rect.top
  const syncTexPoint = convertPageOffsetToSyncTexPoint(page, localX, localY)
  emit('dblclick-page', {
    page,
    x: syncTexPoint?.x ?? localX,
    y: syncTexPoint?.y ?? localY,
  })
}

onMounted(() => {
  document.addEventListener('selectionchange', handleDocumentSelectionChange)
  if (typeof MutationObserver === 'function' && viewerRef.value) {
    annotationMutationObserver = new MutationObserver((records) => {
      if (records.every(isHighlightOnlyMutation)) return
      scheduleRenderAnnotationHighlights()
    })
    annotationMutationObserver.observe(viewerRef.value, {
      childList: true,
      subtree: true,
    })
  }
})

onUnmounted(() => {
  document.removeEventListener('selectionchange', handleDocumentSelectionChange)
  annotationMutationObserver?.disconnect()
  annotationMutationObserver = null
  clearRenderedAnnotationHighlights()
  clearPendingSelection({ clearDomSelection: true })
})

watch(
  () => [
    loading.value,
    pdfUi.pageNumber,
    pdfUi.scaleValue,
    currentPdfAnnotations.value.length,
    activeAnnotationId.value,
  ],
  () => {
    scheduleRenderAnnotationHighlights()
  },
)

watch(currentPdfAnnotations, () => {
  scheduleRenderAnnotationHighlights()
}, { deep: true })

watch(filePathRef, () => {
  clearPendingSelection({ clearDomSelection: true })
  scheduleRenderAnnotationHighlights()
})

defineExpose({
  scrollToPage,
  scrollToLocation,
})
</script>

<style scoped>
.pdf-toolbar-wrap {
  flex: none;
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  box-sizing: border-box;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  overflow: visible;
}

.pdf-toolbar-wrap-embedded {
  border-bottom: 0;
  border-top: 0;
  position: relative;
  z-index: 4;
}

.pdf-toolbar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: var(--document-header-row-height, 24px);
  box-sizing: border-box;
  padding: 0 6px;
  overflow-x: auto;
  overflow-y: visible;
  scrollbar-width: none;
}

.pdf-toolbar::-webkit-scrollbar {
  display: none;
}

.pdf-toolbar-left,
.pdf-toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1 1 0;
}

.pdf-toolbar-right {
  justify-content: flex-end;
}

.pdf-toolbar-center {
  position: absolute;
  inset: 0 auto 0 50%;
  display: flex;
  align-items: center;
  transform: translateX(-50%);
  pointer-events: none;
}

.pdf-toolbar-center > * {
  pointer-events: auto;
}

.pdf-toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}

.pdf-toolbar-separator {
  width: 1px;
  height: 12px;
  flex: none;
  background: color-mix(in srgb, var(--border) 85%, transparent);
}

.pdf-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--fg-muted);
  padding: 0;
  transition: background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}

.pdf-toolbar-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--fg-primary);
}

.pdf-toolbar-btn-active {
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}

.pdf-toolbar-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.pdf-toolbar-input,
.pdf-toolbar-select {
  height: 20px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-primary) 82%, var(--bg-secondary));
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  line-height: 1;
  appearance: none;
}

.pdf-toolbar-input {
  padding: 0 8px;
}

.pdf-toolbar-select {
  min-width: 120px;
  padding: 0 24px 0 8px;
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: calc(100% - 11px) calc(50% - 1px), calc(100% - 7px) calc(50% - 1px);
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
}

.pdf-page-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pdf-page-input {
  width: 36px;
  text-align: center;
  font-size: var(--ui-font-caption);
  font-weight: 600;
}

.pdf-toolbar-label {
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  white-space: nowrap;
}

.pdf-toolbar-group-translate {
  gap: 8px;
}

.pdf-toolbar-group-scale {
  gap: 6px;
}

.pdf-reader-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.pdf-sidebar-shell {
  display: flex;
  flex-direction: column;
  position: absolute;
  inset: 0 auto 0 0;
  width: 220px;
  min-width: 180px;
  max-width: 280px;
  border-right: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-secondary) 94%, var(--bg-primary));
  box-shadow: 10px 0 28px rgba(0, 0, 0, 0.22);
  z-index: 8;
  backdrop-filter: blur(10px);
}

.pdf-sidebar-header {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
  padding: 8px 10px 6px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
}

.pdf-sidebar-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--fg-muted);
  font-size: var(--ui-font-caption);
  font-weight: 600;
  transition: background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}

.pdf-sidebar-tab:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--fg-primary);
}

.pdf-sidebar-tab:disabled {
  opacity: 0.45;
  cursor: default;
}

.pdf-sidebar-tab-active {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 28%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.pdf-outline-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 6px 0;
}

.pdf-outline-empty {
  padding: 12px;
  color: var(--fg-muted);
  font-size: var(--ui-font-caption);
}

.pdf-outline-item {
  display: block;
  width: 100%;
  padding-top: 5px;
  padding-bottom: 5px;
  padding-right: 12px;
  border: 0;
  background: transparent;
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  line-height: 1.35;
  text-align: left;
  transition: background-color 0.16s ease, color 0.16s ease;
}

.pdf-outline-item:hover {
  background: var(--bg-hover);
  color: var(--accent);
}

.pdf-outline-item-title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pdf-page-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 10px 10px 12px;
}

.pdf-page-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--fg-primary);
  text-align: center;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.pdf-page-item + .pdf-page-item {
  margin-top: 10px;
}

.pdf-page-item:hover {
  background: color-mix(in srgb, var(--bg-hover) 84%, transparent);
}

.pdf-page-item-active {
  border-color: color-mix(in srgb, var(--accent) 34%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.pdf-page-thumb {
  width: 100%;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  background: #fff;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.12);
}

.pdf-page-thumb-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pdf-page-thumb-skeleton {
  width: 100%;
  height: 100%;
  min-height: 150px;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.26) 50%, rgba(255, 255, 255, 0) 100%),
    color-mix(in srgb, var(--bg-tertiary, #d6d8df) 78%, white);
  background-size: 180px 100%, 100% 100%;
  background-repeat: no-repeat;
  animation: pdf-page-thumb-shimmer 1.2s linear infinite;
}

.pdf-page-thumb-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 150px;
  padding: 12px;
  color: var(--fg-muted);
  font-size: 11px;
  line-height: 1.35;
  background: color-mix(in srgb, var(--bg-secondary) 85%, white);
}

.pdf-page-label {
  color: var(--fg-muted);
  font-size: 11px;
  font-weight: 600;
}

.pdf-stage-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.pdf-translate-status {
  color: var(--fg-muted);
  font-size: var(--ui-font-caption);
  white-space: nowrap;
}

.pdf-translate-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 20px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  font-size: var(--ui-font-caption);
  color: var(--accent);
}

.pdf-translate-btn:hover:not(:disabled) {
  background: var(--bg-hover);
}

.pdf-translate-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.pdf-annotation-btn,
.pdf-annotation-primary,
.pdf-annotation-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: var(--ui-font-caption);
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.pdf-annotation-btn,
.pdf-annotation-primary {
  height: 20px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
  background: color-mix(in srgb, var(--accent) 11%, transparent);
  color: var(--accent);
}

.pdf-annotation-btn:hover,
.pdf-annotation-primary:hover {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}

.pdf-stage {
  position: absolute;
  inset: 0;
  overflow: auto;
  background: var(--bg-primary);
}

.pdf-stage :deep(.pdfViewer) {
  position: relative;
  min-height: 100%;
}

.pdf-stage :deep(.pdfViewer.removePageBorders .page) {
  margin: 12px auto;
}

.pdf-stage :deep(.page) {
  position: relative;
  box-shadow: none;
}

.pdf-stage :deep(.altals-pdf-annotation-highlight) {
  position: absolute;
  pointer-events: none;
  border-radius: 3px;
  background: color-mix(in srgb, #facc15 32%, transparent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, #facc15 24%, transparent),
    0 1px 0 rgba(255, 255, 255, 0.18);
  z-index: 6;
}

.pdf-stage :deep(.altals-pdf-annotation-highlight-active) {
  background: color-mix(in srgb, var(--accent) 24%, transparent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent),
    0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent);
}

.pdf-stage :deep(.altals-pdf-sync-highlight) {
  position: absolute;
  pointer-events: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--accent) 34%, transparent),
    0 10px 24px color-mix(in srgb, var(--accent) 20%, transparent);
  opacity: 0;
  transform: scaleX(0.985);
  transform-origin: center;
  animation: pdf-sync-highlight-fade 1.4s ease-out forwards;
  z-index: 7;
}

.pdf-stage :deep(.altals-pdf-sync-highlight)::after {
  content: '';
  position: absolute;
  top: 50%;
  left: var(--sync-highlight-anchor-x, 50%);
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 80%, white);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent);
  transform: translate(-50%, -50%);
}

@keyframes pdf-page-thumb-shimmer {
  0% {
    background-position: -180px 0, 0 0;
  }
  100% {
    background-position: 180px 0, 0 0;
  }
}

@keyframes pdf-sync-highlight-fade {
  0% {
    opacity: 0;
    transform: scaleX(0.97);
  }
  12% {
    opacity: 1;
    transform: scaleX(1);
  }
  75% {
    opacity: 0.92;
  }
  100% {
    opacity: 0;
    transform: scaleX(1.01);
  }
}

.pdf-sidebar-overlay-enter-active,
.pdf-sidebar-overlay-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.pdf-sidebar-overlay-enter-from,
.pdf-sidebar-overlay-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

.pdf-annotation-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 10px;
}

.pdf-annotation-empty {
  display: grid;
  gap: 6px;
  padding: 10px;
  border-radius: 10px;
  border: 1px dashed color-mix(in srgb, var(--border) 88%, transparent);
  color: var(--fg-secondary);
  font-size: var(--ui-font-caption);
  background: color-mix(in srgb, var(--bg-primary) 78%, var(--bg-secondary));
}

.pdf-annotation-empty-hint {
  color: var(--fg-muted);
}

.pdf-annotation-pending {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
  background: color-mix(in srgb, var(--accent) 7%, var(--bg-primary));
}

.pdf-annotation-pending-label {
  font-size: var(--ui-font-caption);
  font-weight: 600;
  color: var(--accent);
}

.pdf-annotation-pending-quote,
.pdf-annotation-quote {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  line-height: 1.45;
  text-align: left;
}

.pdf-annotation-item {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--border) 90%, transparent);
  background: color-mix(in srgb, var(--bg-primary) 80%, var(--bg-secondary));
  text-align: left;
  transition: border-color 0.16s ease, background-color 0.16s ease, transform 0.16s ease;
}

.pdf-annotation-item:hover {
  background: color-mix(in srgb, var(--bg-hover) 72%, var(--bg-primary));
  border-color: color-mix(in srgb, var(--accent) 18%, transparent);
}

.pdf-annotation-item-active {
  border-color: color-mix(in srgb, var(--accent) 26%, transparent);
  background: color-mix(in srgb, var(--accent) 7%, var(--bg-primary));
}

.pdf-annotation-item-header,
.pdf-annotation-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pdf-annotation-page,
.pdf-annotation-open {
  color: var(--accent);
  font-size: var(--ui-font-caption);
  font-weight: 600;
}

.pdf-annotation-date {
  color: var(--fg-muted);
  font-size: var(--ui-font-micro);
}

.pdf-annotation-delete {
  height: 18px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  background: transparent;
  color: var(--fg-muted);
}

.pdf-annotation-delete:hover {
  color: var(--error);
  border-color: color-mix(in srgb, var(--error) 24%, transparent);
  background: color-mix(in srgb, var(--error) 10%, transparent);
}

.pdf-annotation-note-shell {
  display: grid;
  gap: 8px;
}

.pdf-annotation-note-create {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--accent);
  font-size: var(--ui-font-caption);
  transition: background-color 0.16s ease, border-color 0.16s ease;
}

.pdf-annotation-note-create:hover {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
}
</style>
