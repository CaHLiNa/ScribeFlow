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
                :disabled="!pdfUi.ready || !pdfUi.sidebarSupported"
                :title="t('Toggle sidebar')"
                @click="toggleSidebar"
              >
                <component :is="sidebarIcon" :size="14" :stroke-width="1.6" />
              </button>
              <button
                class="pdf-toolbar-btn"
                :class="{ 'pdf-toolbar-btn-active': pdfUi.searchOpen }"
                :disabled="!pdfUi.ready"
                :title="t('Search')"
                @click="toggleSearch"
              >
                <IconSearch :size="14" :stroke-width="1.6" />
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

        <div v-if="pdfUi.searchOpen" class="pdf-search-popover">
          <input
            ref="searchInputRef"
            v-model="pdfUi.searchQuery"
            class="pdf-toolbar-input pdf-toolbar-search"
            type="text"
            spellcheck="false"
            :placeholder="t('Find in document...')"
            @input="onSearchInput"
            @keydown.enter.prevent="searchAgain(false)"
            @keydown.shift.enter.prevent="searchAgain(true)"
            @keydown.esc.prevent="closeSearch"
          />
          <button
            class="pdf-toolbar-btn pdf-toolbar-btn-sm"
            :disabled="!pdfUi.ready || !pdfUi.searchQuery"
            :title="t('Previous match')"
            @click="searchAgain(true)"
          >
            <IconChevronLeft :size="12" :stroke-width="1.8" />
          </button>
          <button
            class="pdf-toolbar-btn pdf-toolbar-btn-sm"
            :disabled="!pdfUi.ready || !pdfUi.searchQuery"
            :title="t('Next match')"
            @click="searchAgain(false)"
          >
            <IconChevronRight :size="12" :stroke-width="1.8" />
          </button>
          <span v-if="pdfUi.searchResultText" class="pdf-toolbar-hint">{{ pdfUi.searchResultText }}</span>
          <button
            class="pdf-search-toggle"
            :class="{ 'pdf-search-toggle-active': pdfUi.searchHighlightAll }"
            @click="toggleSearchOption('searchHighlightAll')"
          >
            {{ t('Highlight All') }}
          </button>
          <button
            class="pdf-search-toggle"
            :class="{ 'pdf-search-toggle-active': pdfUi.searchCaseSensitive }"
            @click="toggleSearchOption('searchCaseSensitive')"
          >
            {{ t('Match Case') }}
          </button>
          <button
            class="pdf-search-toggle"
            :class="{ 'pdf-search-toggle-active': pdfUi.searchMatchDiacritics }"
            @click="toggleSearchOption('searchMatchDiacritics')"
          >
            {{ t('Match Diacritics') }}
          </button>
          <button
            class="pdf-search-toggle"
            :class="{ 'pdf-search-toggle-active': pdfUi.searchEntireWord }"
            @click="toggleSearchOption('searchEntireWord')"
          >
            {{ t('Whole Words') }}
          </button>
        </div>
      </div>
    </Teleport>

    <div class="relative flex-1 overflow-hidden">
      <div
        ref="viewerContainerRef"
        class="pdf-stage altals-pdf-stage"
        @dblclick="handleViewerDoubleClick"
      >
        <div ref="viewerRef" class="pdfViewer"></div>
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
        class="absolute inset-0 flex items-center justify-center text-sm"
        style="color: var(--fg-muted); background: var(--bg-primary);"
      >
        {{ t('Could not load PDF') }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch, defineExpose, defineEmits, nextTick, shallowRef } from 'vue'
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMinus,
  IconPlus,
  IconSearch,
} from '@tabler/icons-vue'
import { invoke } from '@tauri-apps/api/core'
import * as pdfjsLib from 'pdfjs-dist'
import { EventBus, PDFLinkService, PDFFindController, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs'
import 'pdfjs-dist/web/pdf_viewer.css'
import { useI18n } from '../../i18n'
import { usePdfTranslateStore } from '../../stores/pdfTranslate'
import { useToastStore } from '../../stores/toast'
import { useWorkspaceStore } from '../../stores/workspace'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).href

const emit = defineEmits(['dblclick-page'])

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
  toolbarTargetSelector: { type: String, default: '' },
})

const PDF_SCALE_PRESETS = [
  'auto',
  'page-width',
  'page-fit',
  'page-actual',
  '0.5',
  '0.75',
  '1',
  '1.25',
  '1.5',
  '2',
  '3',
]
const MIN_SCALE = 0.3
const MAX_SCALE = 5
const FIND_STATE = {
  FOUND: 0,
  NOT_FOUND: 1,
  WRAPPED: 2,
  PENDING: 3,
}

const workspace = useWorkspaceStore()
const pdfTranslateStore = usePdfTranslateStore()
const toastStore = useToastStore()
const { t } = useI18n()

const viewerContainerRef = ref(null)
const viewerRef = ref(null)
const searchInputRef = ref(null)
const pageInputRef = ref(null)
const pageInput = ref('1')
const loading = ref(true)
const error = ref(null)
const pdfSession = shallowRef(null)

const pdfUi = reactive({
  ready: false,
  pageNumber: 1,
  pagesCount: 0,
  canGoPrevious: false,
  canGoNext: false,
  canZoomOut: false,
  canZoomIn: false,
  scaleValue: 'page-width',
  scaleLabel: '',
  sidebarOpen: false,
  sidebarSupported: false,
  searchOpen: false,
  searchQuery: '',
  searchResultText: '',
  searchHighlightAll: true,
  searchCaseSensitive: false,
  searchMatchDiacritics: false,
  searchEntireWord: false,
})

let loadRequestId = 0

const sidebarIcon = computed(() => (
  pdfUi.sidebarOpen ? IconLayoutSidebarLeftCollapse : IconLayoutSidebarLeftExpand
))
const translateTask = computed(() => (
  props.filePath ? pdfTranslateStore.latestTaskForInput(props.filePath) : null
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
const scaleOptions = computed(() => {
  const options = PDF_SCALE_PRESETS.map((value) => ({
    value,
    label: localizeScaleLabel(value),
  }))
  const currentValue = String(pdfUi.scaleValue || '').trim()
  if (!currentValue || options.some(option => option.value === currentValue)) {
    return options
  }
  return [
    ...options,
    {
      value: currentValue,
      label: localizeScaleLabel(currentValue, getPdfViewer()?.currentScale || 1),
    },
  ]
})

function getPdfViewer() {
  return pdfSession.value?.pdfViewer || null
}

function getPdfLinkService() {
  return pdfSession.value?.linkService || null
}

function getPdfEventBus() {
  return pdfSession.value?.eventBus || null
}

function localizeScaleLabel(value, numericScale = null) {
  switch (String(value || '').trim()) {
    case 'auto':
      return t('Automatic Zoom')
    case 'page-width':
      return t('Page Width')
    case 'page-fit':
      return t('Page Fit')
    case 'page-actual':
      return t('Actual Size')
    default: {
      const parsed = Number.parseFloat(value)
      if (Number.isFinite(parsed)) {
        const percent = Math.round((numericScale ?? parsed) * 100)
        return `${percent}%`
      }
      return String(value || '')
    }
  }
}

function resetPdfUi() {
  pdfUi.ready = false
  pdfUi.pageNumber = 1
  pdfUi.pagesCount = 0
  pdfUi.canGoPrevious = false
  pdfUi.canGoNext = false
  pdfUi.canZoomOut = false
  pdfUi.canZoomIn = false
  pdfUi.scaleValue = 'page-width'
  pdfUi.scaleLabel = t('Page Width')
  pdfUi.sidebarOpen = false
  pdfUi.sidebarSupported = false
  pdfUi.searchOpen = false
  pdfUi.searchQuery = ''
  pdfUi.searchResultText = ''
  pdfUi.searchHighlightAll = true
  pdfUi.searchCaseSensitive = false
  pdfUi.searchMatchDiacritics = false
  pdfUi.searchEntireWord = false
  pageInput.value = '1'
}

function syncPdfUi() {
  const viewer = getPdfViewer()
  const session = pdfSession.value
  if (!viewer || !session?.pdfDocument) {
    pdfUi.ready = false
    return
  }

  const pageNumber = Number(viewer.currentPageNumber || 1)
  const pagesCount = Number(viewer.pagesCount || session.pdfDocument.numPages || 0)
  const currentScale = Number(viewer.currentScale || 1)
  const currentScaleValue = String(viewer.currentScaleValue || pdfUi.scaleValue || 'page-width')

  pdfUi.ready = true
  pdfUi.pageNumber = pageNumber
  pdfUi.pagesCount = pagesCount
  pdfUi.canGoPrevious = pageNumber > 1
  pdfUi.canGoNext = pageNumber < pagesCount
  pdfUi.canZoomOut = currentScale > MIN_SCALE
  pdfUi.canZoomIn = currentScale < MAX_SCALE
  pdfUi.scaleValue = currentScaleValue
  pdfUi.scaleLabel = localizeScaleLabel(currentScaleValue, currentScale)

  if (document.activeElement !== pageInputRef.value) {
    pageInput.value = String(pageNumber || 1)
  }
}

function updateSearchResultText(event = {}) {
  const matchesCount = event.matchesCount || { current: 0, total: 0 }
  const total = Number(matchesCount.total || 0)
  const current = Number(matchesCount.current || 0)

  if (event.state === FIND_STATE.PENDING) {
    pdfUi.searchResultText = t('Searching...')
    return
  }
  if (event.state === FIND_STATE.NOT_FOUND) {
    pdfUi.searchResultText = t('Phrase not found')
    return
  }
  if (event.state === FIND_STATE.WRAPPED) {
    pdfUi.searchResultText = event.previous
      ? t('Reached top of document, continued from bottom')
      : t('Reached end of document, continued from top')
    return
  }
  if (total > 0) {
    pdfUi.searchResultText = `${current} / ${total}`
    return
  }
  pdfUi.searchResultText = ''
}

function attachViewerListeners(session, requestId) {
  const { eventBus, pdfViewer } = session

  eventBus.on('pagesinit', () => {
    if (requestId !== loadRequestId) return
    pdfViewer.currentScaleValue = pdfUi.scaleValue || 'page-width'
    syncPdfUi()
  })

  eventBus.on('pagerendered', () => {
    if (requestId !== loadRequestId) return
    loading.value = false
    syncPdfUi()
  }, { once: true })

  eventBus.on('pagesloaded', () => {
    if (requestId !== loadRequestId) return
    syncPdfUi()
  })

  eventBus.on('pagechanging', () => {
    if (requestId !== loadRequestId) return
    syncPdfUi()
  })

  eventBus.on('scalechanging', () => {
    if (requestId !== loadRequestId) return
    syncPdfUi()
  })

  eventBus.on('updatefindmatchescount', (event) => {
    if (requestId !== loadRequestId) return
    updateSearchResultText(event)
    syncPdfUi()
  })

  eventBus.on('updatefindcontrolstate', (event) => {
    if (requestId !== loadRequestId) return
    updateSearchResultText(event)
    syncPdfUi()
  })
}

async function cleanupPdfSession() {
  const session = pdfSession.value
  pdfSession.value = null

  if (viewerRef.value) {
    viewerRef.value.replaceChildren()
  }

  if (!session) return

  try {
    session.abortController?.abort()
  } catch {}

  try {
    session.findController?.setDocument(null)
  } catch {}

  try {
    session.linkService?.setDocument(null, null)
  } catch {}

  try {
    session.pdfViewer?.setDocument(null)
    session.pdfViewer?.cleanup?.()
  } catch {}

  try {
    await session.loadingTask?.destroy?.()
  } catch {}
}

async function buildViewerSession(requestId, bytes) {
  await nextTick()
  if (requestId !== loadRequestId || !viewerContainerRef.value || !viewerRef.value) return null

  const eventBus = new EventBus()
  const linkService = new PDFLinkService({ eventBus })
  const findController = new PDFFindController({ eventBus, linkService })
  const abortController = new AbortController()
  const pdfViewer = new PDFViewer({
    container: viewerContainerRef.value,
    viewer: viewerRef.value,
    eventBus,
    linkService,
    findController,
    removePageBorders: true,
    abortSignal: abortController.signal,
  })

  linkService.setViewer(pdfViewer)

  const loadingTask = pdfjsLib.getDocument({ data: bytes })
  const session = {
    requestId,
    eventBus,
    linkService,
    findController,
    pdfViewer,
    loadingTask,
    abortController,
    pdfDocument: null,
  }
  pdfSession.value = session
  attachViewerListeners(session, requestId)
  return session
}

async function loadPdf() {
  const requestId = ++loadRequestId
  loading.value = true
  error.value = null
  resetPdfUi()
  await cleanupPdfSession()

  try {
    const rawBytes = await invoke('read_file_binary', { path: props.filePath })
    if (requestId !== loadRequestId) return

    const bytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes)
    const session = await buildViewerSession(requestId, bytes)
    if (!session || requestId !== loadRequestId) return

    const pdfDocument = await session.loadingTask.promise
    if (requestId !== loadRequestId) {
      await session.loadingTask.destroy().catch(() => {})
      return
    }

    session.pdfDocument = pdfDocument
    session.linkService.setDocument(pdfDocument, null)
    await session.pdfViewer.setDocument(pdfDocument)
    syncPdfUi()
  } catch (e) {
    if (requestId !== loadRequestId) return
    error.value = e?.message || String(e)
    loading.value = false
    await cleanupPdfSession()
  }
}

function dispatchFind(type = '', findPrevious = false) {
  const eventBus = getPdfEventBus()
  if (!eventBus) return

  eventBus.dispatch('find', {
    source: getPdfViewer(),
    type,
    query: pdfUi.searchQuery,
    caseSensitive: pdfUi.searchCaseSensitive,
    entireWord: pdfUi.searchEntireWord,
    highlightAll: pdfUi.searchHighlightAll,
    findPrevious,
    matchDiacritics: pdfUi.searchMatchDiacritics,
  })
}

function openSearch() {
  pdfUi.searchOpen = true
  nextTick(() => searchInputRef.value?.focus())
}

function closeSearch() {
  pdfUi.searchOpen = false
}

function toggleSearch() {
  if (pdfUi.searchOpen) {
    closeSearch()
    return
  }
  openSearch()
}

function onSearchInput() {
  if (!pdfUi.searchQuery) {
    pdfUi.searchResultText = ''
    return
  }
  dispatchFind('')
}

function searchAgain(findPrevious = false) {
  if (!pdfUi.searchQuery) return
  dispatchFind('again', findPrevious)
}

function toggleSearchOption(key) {
  pdfUi[key] = !pdfUi[key]
  if (!pdfUi.searchQuery) return
  dispatchFind('')
}

function toggleSidebar() {
  if (!pdfUi.sidebarSupported) return
}

function goPreviousPage() {
  const viewer = getPdfViewer()
  if (!viewer || !pdfUi.canGoPrevious) return
  viewer.currentPageNumber = Math.max(1, pdfUi.pageNumber - 1)
  syncPdfUi()
}

function goNextPage() {
  const viewer = getPdfViewer()
  if (!viewer || !pdfUi.canGoNext) return
  viewer.currentPageNumber = Math.min(pdfUi.pagesCount, pdfUi.pageNumber + 1)
  syncPdfUi()
}

function commitPageNumber() {
  const viewer = getPdfViewer()
  const nextPage = Number(pageInput.value)
  if (!viewer || !Number.isInteger(nextPage) || nextPage < 1 || nextPage > pdfUi.pagesCount) {
    pageInput.value = String(pdfUi.pageNumber || 1)
    return
  }
  viewer.currentPageNumber = nextPage
  syncPdfUi()
}

function zoomOut() {
  const viewer = getPdfViewer()
  if (!viewer) return
  viewer.currentScale = Math.max(MIN_SCALE, Number(viewer.currentScale || 1) / 1.1)
  syncPdfUi()
}

function zoomIn() {
  const viewer = getPdfViewer()
  if (!viewer) return
  viewer.currentScale = Math.min(MAX_SCALE, Number(viewer.currentScale || 1) * 1.1)
  syncPdfUi()
}

function applyScale() {
  const viewer = getPdfViewer()
  if (!viewer) return
  viewer.currentScaleValue = pdfUi.scaleValue
  syncPdfUi()
}

async function translatePdf() {
  if (!props.filePath || translateTask.value?.status === 'running') return

  try {
    await pdfTranslateStore.startTranslation(props.filePath)
    const name = props.filePath.split('/').pop()
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

  const rect = pageElement.getBoundingClientRect()
  emit('dblclick-page', {
    page: Number(pageElement.dataset.pageNumber || 0),
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  })
}

function scrollToPage(pageNumber) {
  const targetPage = Number(pageNumber)
  if (!Number.isInteger(targetPage) || targetPage < 1) return
  const linkService = getPdfLinkService()
  if (linkService?.goToPage) {
    linkService.goToPage(targetPage)
    syncPdfUi()
  }
}

function scrollToLocation(pageNumber, x, y) {
  const targetPage = Number(pageNumber)
  if (!Number.isInteger(targetPage) || targetPage < 1) return

  const viewer = getPdfViewer()
  if (!viewer?.scrollPageIntoView) {
    scrollToPage(targetPage)
    return
  }

  const xCoord = Number(x)
  const yCoord = Number(y)
  const destArray = [
    null,
    { name: 'XYZ' },
    Number.isFinite(xCoord) ? xCoord : null,
    Number.isFinite(yCoord) ? yCoord : null,
    null,
  ]
  viewer.scrollPageIntoView({
    pageNumber: targetPage,
    destArray,
    allowNegativeOffset: true,
    ignoreDestinationZoom: true,
  })
  syncPdfUi()
}

function handlePdfUpdated(event) {
  if (event.detail?.path === props.filePath) {
    loadPdf()
  }
}

onMounted(() => {
  window.addEventListener('pdf-updated', handlePdfUpdated)
  loadPdf()
})

onUnmounted(async () => {
  loadRequestId += 1
  window.removeEventListener('pdf-updated', handlePdfUpdated)
  await cleanupPdfSession()
})

watch(() => props.filePath, () => {
  loadPdf()
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

.pdf-toolbar-btn-sm {
  width: 18px;
  height: 18px;
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

.pdf-toolbar-search {
  width: 120px;
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

.pdf-toolbar-label,
.pdf-toolbar-hint {
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  white-space: nowrap;
}

.pdf-toolbar-hint {
  color: var(--fg-muted);
  font-size: 11px;
}

.pdf-toolbar-group-translate {
  gap: 8px;
}

.pdf-toolbar-group-scale {
  gap: 6px;
}

.pdf-search-popover {
  position: absolute;
  top: calc(var(--document-header-row-height, 24px) + 6px);
  left: 6px;
  z-index: 24;
  display: flex;
  align-items: center;
  gap: 6px;
  width: max-content;
  max-width: calc(100% - 12px);
  box-sizing: border-box;
  padding: 6px;
  min-height: 32px;
  border: 1px solid color-mix(in srgb, var(--border) 92%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-secondary) 96%, var(--bg-primary));
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
  overflow-x: auto;
  scrollbar-width: none;
}

.pdf-search-popover::-webkit-scrollbar {
  display: none;
}

.pdf-search-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  white-space: nowrap;
}

.pdf-search-toggle:hover {
  background: var(--bg-hover);
}

.pdf-search-toggle-active {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 28%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
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
  box-shadow: none;
}
</style>
