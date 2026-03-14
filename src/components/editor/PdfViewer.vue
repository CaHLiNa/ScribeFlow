<template>
  <div class="h-full flex flex-col overflow-hidden">
    <Teleport :to="toolbarTargetSelector || 'body'" :disabled="!toolbarTargetSelector">
      <div
        v-if="viewerSrc && !error"
        class="pdf-toolbar-wrap"
        :class="{ 'pdf-toolbar-wrap-embedded': !!toolbarTargetSelector }"
      >
        <div class="pdf-toolbar">
        <div class="pdf-toolbar-group">
          <button
            class="pdf-toolbar-btn"
            :class="{ 'pdf-toolbar-btn-active': pdfUi.sidebarOpen }"
            :disabled="!pdfUi.ready"
            title="Toggle sidebar"
            @click="toggleSidebar"
          >
            <component :is="sidebarIcon" :size="14" :stroke-width="1.6" />
          </button>
          <button
            class="pdf-toolbar-btn"
            :class="{ 'pdf-toolbar-btn-active': pdfUi.searchOpen }"
            :disabled="!pdfUi.ready"
            title="Search"
            @click="toggleSearch"
          >
            <IconSearch :size="14" :stroke-width="1.6" />
          </button>
          <div v-if="pdfUi.searchOpen" class="pdf-search-inline">
            <input
              ref="searchInputRef"
              v-model="pdfUi.searchQuery"
              class="pdf-toolbar-input pdf-toolbar-search"
              type="text"
              spellcheck="false"
              placeholder="Search"
              @input="onSearchInput"
              @keydown.enter.prevent="searchAgain(false)"
              @keydown.shift.enter.prevent="searchAgain(true)"
            />
            <button
              class="pdf-toolbar-btn pdf-toolbar-btn-sm"
              :disabled="!pdfUi.ready || !pdfUi.searchQuery"
              title="Previous match"
              @click="searchAgain(true)"
            >
              <IconChevronUp :size="12" :stroke-width="1.8" />
            </button>
            <button
              class="pdf-toolbar-btn pdf-toolbar-btn-sm"
              :disabled="!pdfUi.ready || !pdfUi.searchQuery"
              title="Next match"
              @click="searchAgain(false)"
            >
              <IconChevronDown :size="12" :stroke-width="1.8" />
            </button>
            <span v-if="pdfUi.searchResultText" class="pdf-toolbar-hint">{{ pdfUi.searchResultText }}</span>
          </div>
        </div>

        <div class="pdf-toolbar-separator"></div>

        <div class="pdf-toolbar-group">
          <button
            class="pdf-toolbar-btn"
            :disabled="!pdfUi.ready || !pdfUi.canGoPrevious"
            title="Previous page"
            @click="goPreviousPage"
          >
            <IconChevronUp :size="13" :stroke-width="1.8" />
          </button>
          <button
            class="pdf-toolbar-btn"
            :disabled="!pdfUi.ready || !pdfUi.canGoNext"
            title="Next page"
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

        <div class="pdf-toolbar-separator"></div>

        <div class="pdf-toolbar-group">
          <button
            class="pdf-toolbar-btn"
            :disabled="!pdfUi.ready || !pdfUi.canZoomOut"
            title="Zoom out"
            @click="zoomOut"
          >
            <IconMinus :size="13" :stroke-width="1.8" />
          </button>
          <button
            class="pdf-toolbar-btn"
            :disabled="!pdfUi.ready || !pdfUi.canZoomIn"
            title="Zoom in"
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

        <div class="pdf-toolbar-spacer"></div>

        <div class="pdf-toolbar-group">
          <button
            class="pdf-toolbar-btn"
            :class="{ 'pdf-toolbar-btn-active': pdfUi.annotationMode === ANNOTATION_MODES.HIGHLIGHT }"
            :disabled="!pdfUi.ready || !pdfUi.canHighlight"
            title="Highlight"
            @click="setAnnotationMode(ANNOTATION_MODES.HIGHLIGHT)"
          >
            <IconHighlight :size="14" :stroke-width="1.6" />
          </button>
          <button
            class="pdf-toolbar-btn"
            :class="{ 'pdf-toolbar-btn-active': pdfUi.annotationMode === ANNOTATION_MODES.FREETEXT }"
            :disabled="!pdfUi.ready || !pdfUi.canFreeText"
            title="Text"
            @click="setAnnotationMode(ANNOTATION_MODES.FREETEXT)"
          >
            <IconLetterT :size="14" :stroke-width="1.6" />
          </button>
          <button
            class="pdf-toolbar-btn"
            :class="{ 'pdf-toolbar-btn-active': pdfUi.annotationMode === ANNOTATION_MODES.INK }"
            :disabled="!pdfUi.ready || !pdfUi.canInk"
            title="Draw"
            @click="setAnnotationMode(ANNOTATION_MODES.INK)"
          >
            <IconBrush :size="14" :stroke-width="1.6" />
          </button>
          <button
            class="pdf-toolbar-btn"
            :class="{ 'pdf-toolbar-btn-active': pdfUi.annotationMode === ANNOTATION_MODES.STAMP }"
            :disabled="!pdfUi.ready || !pdfUi.canStamp"
            title="Stamp"
            @click="setAnnotationMode(ANNOTATION_MODES.STAMP)"
          >
            <IconPhoto :size="14" :stroke-width="1.6" />
          </button>
        </div>

        <div class="pdf-toolbar-separator"></div>

        <div class="pdf-toolbar-group pdf-toolbar-group-menu">
          <button
            ref="menuButtonRef"
            class="pdf-toolbar-btn"
            :class="{ 'pdf-toolbar-btn-active': moreMenuOpen }"
            :disabled="!pdfUi.ready"
            title="More"
            @mousedown.stop
            @click.stop="toggleMoreMenu"
          >
            <IconDots :size="14" :stroke-width="1.6" />
          </button>
        </div>
        </div>
      </div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="moreMenuOpen"
        ref="menuPopupRef"
        class="pdf-toolbar-menu pdf-toolbar-menu-floating"
        :style="menuStyle"
        @mousedown.stop
        @click.stop
      >
        <button class="pdf-toolbar-menu-item" @click="printPdf">
          <IconPrinter :size="13" :stroke-width="1.6" />
          <span>Print</span>
        </button>
        <button class="pdf-toolbar-menu-item" @click="downloadPdf">
          <IconDownload :size="13" :stroke-width="1.6" />
          <span>Download</span>
        </button>
        <button class="pdf-toolbar-menu-item" @click="rotateClockwise">
          <IconRotateClockwise2 :size="13" :stroke-width="1.6" />
          <span>Rotate Clockwise</span>
        </button>
        <button class="pdf-toolbar-menu-item" @click="rotateCounterClockwise">
          <IconRotate2 :size="13" :stroke-width="1.6" />
          <span>Rotate Counterclockwise</span>
        </button>
      </div>
    </Teleport>

    <div v-if="loading" class="flex items-center justify-center h-full text-sm"
         style="color: var(--fg-muted);">
      Loading PDF...
    </div>
    <div v-else-if="error" class="flex items-center justify-center h-full text-sm"
         style="color: var(--fg-muted);">
      Could not load PDF
    </div>
    <iframe
      v-else-if="viewerSrc"
      ref="iframeRef"
      :src="viewerSrc"
      class="w-full flex-1 border-0"
      style="display: block;"
      @load="onIframeLoad"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch, defineExpose, defineEmits, nextTick } from 'vue'
import {
  IconBrush,
  IconChevronDown,
  IconChevronUp,
  IconDots,
  IconDownload,
  IconHighlight,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLetterT,
  IconMinus,
  IconPhoto,
  IconPlus,
  IconPrinter,
  IconRotate2,
  IconRotateClockwise2,
  IconSearch,
} from '@tabler/icons-vue'
import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from '../../stores/workspace'

const emit = defineEmits(['dblclick-page'])

const props = defineProps({
  filePath: { type: String, required: true },
  paneId:   { type: String, required: true },
  toolbarTargetSelector: { type: String, default: '' },
})

const ANNOTATION_MODES = Object.freeze({
  NONE: 0,
  FREETEXT: 3,
  HIGHLIGHT: 9,
  STAMP: 13,
  INK: 15,
})

const PDF_VIEWER_OVERRIDE_STYLE_ID = 'altals-pdf-viewer-overrides'

const workspace = useWorkspaceStore()
const iframeRef = ref(null)
const viewerSrc = ref(null)
const loading = ref(true)
const error = ref(null)
const searchInputRef = ref(null)
const pageInputRef = ref(null)
const menuButtonRef = ref(null)
const menuPopupRef = ref(null)
const pageInput = ref('1')
const scaleOptions = ref([])
const moreMenuOpen = ref(false)
const moreMenuPosition = reactive({
  top: 0,
  left: 0,
})

const pdfUi = reactive({
  ready: false,
  pageNumber: 1,
  pagesCount: 0,
  canGoPrevious: false,
  canGoNext: false,
  canZoomOut: false,
  canZoomIn: false,
  scaleValue: 'auto',
  scaleLabel: 'Automatic Zoom',
  sidebarOpen: false,
  searchOpen: false,
  searchQuery: '',
  searchResultText: '',
  annotationMode: ANNOTATION_MODES.NONE,
  canHighlight: false,
  canFreeText: false,
  canInk: false,
  canStamp: false,
})

let currentBlobUrl = null
let syncTimer = null

const LIGHT_THEMES = new Set(['light', 'one-light', 'humane', 'solarized'])
const isDark = computed(() => !LIGHT_THEMES.has(workspace.theme))
const sidebarIcon = computed(() => (
  pdfUi.sidebarOpen ? IconLayoutSidebarLeftCollapse : IconLayoutSidebarLeftExpand
))
const menuStyle = computed(() => ({
  top: `${moreMenuPosition.top}px`,
  left: `${moreMenuPosition.left}px`,
}))

function resetPdfUi() {
  pdfUi.ready = false
  pdfUi.pageNumber = 1
  pdfUi.pagesCount = 0
  pdfUi.canGoPrevious = false
  pdfUi.canGoNext = false
  pdfUi.canZoomOut = false
  pdfUi.canZoomIn = false
  pdfUi.scaleValue = 'auto'
  pdfUi.scaleLabel = 'Automatic Zoom'
  pdfUi.sidebarOpen = false
  pdfUi.searchResultText = ''
  pdfUi.annotationMode = ANNOTATION_MODES.NONE
  pdfUi.canHighlight = false
  pdfUi.canFreeText = false
  pdfUi.canInk = false
  pdfUi.canStamp = false
  pageInput.value = '1'
  scaleOptions.value = []
  moreMenuOpen.value = false
}

function updateMoreMenuPosition() {
  if (!moreMenuOpen.value) return

  const buttonRect = menuButtonRef.value?.getBoundingClientRect?.()
  if (!buttonRect) return

  const menuWidth = menuPopupRef.value?.offsetWidth || 170
  const menuHeight = menuPopupRef.value?.offsetHeight || 0
  const viewportPadding = 8

  let left = buttonRect.right - menuWidth
  left = Math.max(viewportPadding, Math.min(left, window.innerWidth - menuWidth - viewportPadding))

  let top = buttonRect.bottom + 6
  if (menuHeight > 0) {
    top = Math.min(top, window.innerHeight - menuHeight - viewportPadding)
  }
  top = Math.max(viewportPadding, top)

  moreMenuPosition.top = Math.round(top)
  moreMenuPosition.left = Math.round(left)
}

function clearSyncTimer() {
  if (syncTimer) {
    window.clearInterval(syncTimer)
    syncTimer = null
  }
}

function getPdfWindow() {
  return iframeRef.value?.contentWindow || null
}

function getPdfDocument() {
  return iframeRef.value?.contentDocument || null
}

function getPdfApp() {
  return getPdfWindow()?.PDFViewerApplication || null
}

function getPdfElement(...ids) {
  const doc = getPdfDocument()
  if (!doc) return null
  for (const id of ids) {
    const element = doc.getElementById(id)
    if (element) return element
  }
  return null
}

function clickPdfElement(...ids) {
  const element = getPdfElement(...ids)
  if (!element || element.disabled) return false
  element.click()
  syncPdfUi()
  return true
}

function normalizeScaleOptions(select) {
  const options = Array.from(select?.options || [])
    .filter(option => option.value)
    .map(option => ({
      value: option.value,
      label: (option.textContent || '').trim(),
    }))
  const customOption = options.find(option => option.value === 'custom')
  if (customOption && customOption.label) return options
  return options.filter(option => option.value !== 'custom')
}

function isButtonAvailable(doc, id) {
  const button = doc?.getElementById(id)
  return !!button && !button.disabled && !button.closest('[hidden]')
}

function applyTheme() {
  const doc = getPdfDocument()
  if (!doc?.documentElement) return
  doc.documentElement.style.setProperty('color-scheme', isDark.value ? 'dark' : 'light')
}

function injectViewerOverrides() {
  const doc = getPdfDocument()
  if (!doc?.head || doc.getElementById(PDF_VIEWER_OVERRIDE_STYLE_ID)) return

  const style = doc.createElement('style')
  style.id = PDF_VIEWER_OVERRIDE_STYLE_ID
  style.textContent = `
    :root { --toolbar-height: 0px !important; }
    .toolbar,
    #toolbarContainer,
    #toolbarViewer,
    #toolbarViewerLeft,
    #toolbarViewerMiddle,
    #toolbarViewerRight,
    #toolbarViewerLeft > :not(#viewsManager),
    #secondaryToolbar,
    #findbar,
    #editorHighlightParamsToolbar,
    #editorFreeTextParamsToolbar,
    #editorInkParamsToolbar,
    #editorStampParamsToolbar {
      display: none !important;
    }
    .toolbar,
    #toolbarContainer,
    #toolbarViewer,
    #toolbarViewerLeft {
      display: flex !important;
      min-height: 0 !important;
      height: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      overflow: visible !important;
    }
    #toolbarViewerLeft {
      position: relative !important;
      gap: 0 !important;
    }
    #viewsManager {
      top: 0 !important;
      z-index: 40 !important;
      pointer-events: auto !important;
    }
    #viewerContainer {
      inset: 0 !important;
    }
    #sidebarContent {
      inset-block: 0 !important;
    }
    #toolbarContainer #loadingBar {
      top: 0 !important;
    }
  `
  doc.head.appendChild(style)
}

function syncPdfUi() {
  const app = getPdfApp()
  const doc = getPdfDocument()
  if (!app?.pdfViewer || !doc) return

  const previousButton = doc.getElementById('previous')
  const nextButton = doc.getElementById('next')
  const zoomOutButton = doc.getElementById('zoomOutButton')
  const zoomInButton = doc.getElementById('zoomInButton')
  const scaleSelect = doc.getElementById('scaleSelect')
  const findResultsCount = doc.getElementById('findResultsCount')
  const findMsg = doc.getElementById('findMsg')
  const toggleButton = doc.getElementById('viewsManagerToggleButton')
  const viewsManager = app.viewsManager

  pdfUi.ready = true
  pdfUi.pageNumber = Number(app.page || 1)
  pdfUi.pagesCount = Number(app.pagesCount || 0)
  pdfUi.canGoPrevious = !!previousButton && !previousButton.disabled
  pdfUi.canGoNext = !!nextButton && !nextButton.disabled
  pdfUi.canZoomOut = !!zoomOutButton && !zoomOutButton.disabled
  pdfUi.canZoomIn = !!zoomInButton && !zoomInButton.disabled
  pdfUi.sidebarOpen = typeof viewsManager?.isOpen === 'boolean'
    ? viewsManager.isOpen
    : toggleButton?.getAttribute('aria-expanded') === 'true'
  pdfUi.annotationMode = Number(app.pdfViewer.annotationEditorMode ?? ANNOTATION_MODES.NONE)
  pdfUi.canHighlight = isButtonAvailable(doc, 'editorHighlightButton')
  pdfUi.canFreeText = isButtonAvailable(doc, 'editorFreeTextButton')
  pdfUi.canInk = isButtonAvailable(doc, 'editorInkButton')
  pdfUi.canStamp = isButtonAvailable(doc, 'editorStampButton')
  pdfUi.searchResultText = [findResultsCount?.textContent, findMsg?.textContent]
    .map(value => (value || '').trim())
    .filter(Boolean)
    .join(' ')

  if (scaleSelect) {
    const nextOptions = normalizeScaleOptions(scaleSelect)
    if (nextOptions.length > 0) {
      scaleOptions.value = nextOptions
    }
    pdfUi.scaleValue = scaleSelect.value || 'auto'
    pdfUi.scaleLabel = (scaleSelect.options[scaleSelect.selectedIndex]?.textContent || '').trim() || pdfUi.scaleLabel
  }

  if (document.activeElement !== pageInputRef.value) {
    pageInput.value = String(pdfUi.pageNumber || 1)
  }
}

function dispatchPdfEvent(type, detail = {}) {
  const app = getPdfApp()
  if (!app?.eventBus) return
  app.eventBus.dispatch(type, { source: app, ...detail })
  syncPdfUi()
}

function openSearch() {
  pdfUi.searchOpen = true
  nextTick(() => searchInputRef.value?.focus())
}

function toggleSearch() {
  pdfUi.searchOpen = !pdfUi.searchOpen
  if (pdfUi.searchOpen) {
    nextTick(() => searchInputRef.value?.focus())
  }
}

function onSearchInput() {
  const app = getPdfApp()
  if (!app?.eventBus) return
  app.eventBus.dispatch('find', {
    source: app,
    type: '',
    query: pdfUi.searchQuery,
    caseSensitive: false,
    entireWord: false,
    highlightAll: true,
    findPrevious: false,
    matchDiacritics: false,
  })
}

function searchAgain(findPrevious = false) {
  const app = getPdfApp()
  if (!app?.eventBus || !pdfUi.searchQuery) return
  app.eventBus.dispatch('find', {
    source: app,
    type: 'again',
    query: pdfUi.searchQuery,
    caseSensitive: false,
    entireWord: false,
    highlightAll: true,
    findPrevious,
    matchDiacritics: false,
  })
}

function toggleSidebar() {
  const viewsManager = getPdfApp()?.viewsManager
  if (typeof viewsManager?.toggle === 'function') {
    viewsManager.toggle()
    syncPdfUi()
    return
  }
  clickPdfElement('viewsManagerToggleButton')
}

function goPreviousPage() {
  if (!clickPdfElement('previous')) {
    dispatchPdfEvent('previouspage')
  }
}

function goNextPage() {
  if (!clickPdfElement('next')) {
    dispatchPdfEvent('nextpage')
  }
}

function commitPageNumber() {
  const app = getPdfApp()
  const nextPage = Number(pageInput.value)
  if (!app || !Number.isInteger(nextPage) || nextPage < 1 || nextPage > pdfUi.pagesCount) {
    pageInput.value = String(pdfUi.pageNumber || 1)
    return
  }
  app.page = nextPage
  syncPdfUi()
}

function zoomOut() {
  if (!clickPdfElement('zoomOutButton')) {
    dispatchPdfEvent('zoomout')
  }
}

function zoomIn() {
  if (!clickPdfElement('zoomInButton')) {
    dispatchPdfEvent('zoomin')
  }
}

function applyScale() {
  const scaleSelect = getPdfElement('scaleSelect')
  if (scaleSelect && !scaleSelect.disabled) {
    scaleSelect.value = pdfUi.scaleValue
    scaleSelect.dispatchEvent(new Event('change', { bubbles: true }))
    syncPdfUi()
    return
  }

  const app = getPdfApp()
  if (!app?.pdfViewer) return
  app.pdfViewer.currentScaleValue = pdfUi.scaleValue
  syncPdfUi()
}

function setAnnotationMode(mode) {
  const buttonIds = {
    [ANNOTATION_MODES.HIGHLIGHT]: 'editorHighlightButton',
    [ANNOTATION_MODES.FREETEXT]: 'editorFreeTextButton',
    [ANNOTATION_MODES.INK]: 'editorInkButton',
    [ANNOTATION_MODES.STAMP]: 'editorStampButton',
  }
  const targetButtonId = buttonIds[mode]
  if (targetButtonId && clickPdfElement(targetButtonId)) return

  const targetMode = pdfUi.annotationMode === mode ? ANNOTATION_MODES.NONE : mode
  dispatchPdfEvent('switchannotationeditormode', { mode: targetMode })
}

function printPdf() {
  moreMenuOpen.value = false
  if (!clickPdfElement('printButton', 'secondaryPrint')) {
    dispatchPdfEvent('print')
  }
}

function downloadPdf() {
  moreMenuOpen.value = false
  if (!clickPdfElement('downloadButton', 'secondaryDownload')) {
    dispatchPdfEvent('download')
  }
}

function rotateClockwise() {
  moreMenuOpen.value = false
  if (!clickPdfElement('pageRotateCw')) {
    dispatchPdfEvent('rotatecw')
  }
}

function rotateCounterClockwise() {
  moreMenuOpen.value = false
  if (!clickPdfElement('pageRotateCcw')) {
    dispatchPdfEvent('rotateccw')
  }
}

function toggleMoreMenu() {
  moreMenuOpen.value = !moreMenuOpen.value
  if (moreMenuOpen.value) {
    nextTick(updateMoreMenuPosition)
  }
}

function handleDocumentPointerDown(event) {
  if (!moreMenuOpen.value) return
  if (menuButtonRef.value?.contains(event.target)) return
  if (menuPopupRef.value?.contains(event.target)) return
  moreMenuOpen.value = false
}

function handleWindowMetricsChange() {
  if (!moreMenuOpen.value) return
  nextTick(updateMoreMenuPosition)
}

function handleIframeDoubleClick(event) {
  const pageElement = event.target?.closest?.('.page[data-page-number]')
  if (!pageElement) return

  const rect = pageElement.getBoundingClientRect()
  emit('dblclick-page', {
    page: Number(pageElement.dataset.pageNumber || 0),
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  })
}

async function onIframeLoad() {
  const win = getPdfWindow()
  const app = getPdfApp()
  if (!win || !app) return

  try {
    if (app.initializedPromise) {
      await app.initializedPromise
    }
  } catch {}

  applyTheme()
  injectViewerOverrides()
  syncPdfUi()
  clearSyncTimer()
  syncTimer = window.setInterval(syncPdfUi, 250)

  try {
    win.document.addEventListener('mousedown', () => {
      iframeRef.value?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    win.document.addEventListener('dblclick', handleIframeDoubleClick)
    win.document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault()
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: e.key,
          code: e.code,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          bubbles: true,
          cancelable: true,
        }))
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        openSearch()
      }
    })
  } catch {}
}

function scrollToPage(pageNumber) {
  const targetPage = Number(pageNumber)
  if (!Number.isInteger(targetPage) || targetPage < 1) return

  const app = getPdfApp()
  if (!app?.pdfLinkService?.goToPage) return

  app.pdfLinkService.goToPage(targetPage)
}

function scrollToLocation(pageNumber, x, y) {
  const targetPage = Number(pageNumber)
  if (!Number.isInteger(targetPage) || targetPage < 1) return

  const xCoord = Number(x)
  const yCoord = Number(y)
  const app = getPdfApp()
  if (!app?.pdfLinkService) return

  if (Number.isFinite(xCoord) && Number.isFinite(yCoord) && typeof app.pdfLinkService.goToXY === 'function') {
    app.pdfLinkService.goToXY(targetPage, xCoord, yCoord)
    return
  }

  if (typeof app.pdfLinkService.goToPage === 'function') {
    app.pdfLinkService.goToPage(targetPage)
  }
}

watch(isDark, applyTheme)

async function loadPdf() {
  loading.value = true
  error.value = null
  clearSyncTimer()
  resetPdfUi()

  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl)
    currentBlobUrl = null
  }

  try {
    const base64 = await invoke('read_file_base64', { path: props.filePath })
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    currentBlobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    viewerSrc.value = `/pdfjs-viewer/web/viewer.html?file=${encodeURIComponent(currentBlobUrl)}`
  } catch (e) {
    error.value = e.toString()
  } finally {
    loading.value = false
  }
}

function handlePdfUpdated(event) {
  if (event.detail?.path === props.filePath) loadPdf()
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentPointerDown)
  window.addEventListener('pdf-updated', handlePdfUpdated)
  window.addEventListener('resize', handleWindowMetricsChange)
  loadPdf()
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentPointerDown)
  window.removeEventListener('pdf-updated', handlePdfUpdated)
  window.removeEventListener('resize', handleWindowMetricsChange)
  clearSyncTimer()
  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl)
})

watch(() => props.filePath, loadPdf)

defineExpose({
  scrollToPage,
  scrollToLocation,
})
</script>

<style scoped>
.pdf-toolbar-wrap {
  flex: none;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  overflow-y: visible;
  scrollbar-width: none;
}

.pdf-toolbar-wrap::-webkit-scrollbar {
  display: none;
}

.pdf-toolbar-wrap-embedded {
  border-bottom: 0;
  border-top: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  position: relative;
  z-index: 4;
}

.pdf-toolbar {
  display: flex;
  align-items: center;
  width: max-content;
  min-width: 100%;
  box-sizing: border-box;
  gap: 6px;
  min-height: 24px;
  padding: 1px 6px;
  overflow: visible;
}

.pdf-toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}

.pdf-toolbar-group-menu {
  position: relative;
}

.pdf-toolbar-spacer {
  flex: 1 1 auto;
  min-width: 4px;
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

.pdf-search-inline {
  display: flex;
  align-items: center;
  gap: 4px;
}

.pdf-toolbar-menu {
  z-index: 9999;
  min-width: 160px;
  padding: 4px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-secondary) 94%, var(--bg-primary));
  box-shadow: 0 10px 24px rgb(0 0 0 / 0.18);
}

.pdf-toolbar-menu-floating {
  position: fixed;
}

.pdf-toolbar-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  border: 0;
  background: transparent;
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  text-align: left;
}

.pdf-toolbar-menu-item:hover {
  background: var(--bg-hover);
}
</style>
