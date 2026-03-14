<template>
  <div class="h-full flex flex-col overflow-hidden">
    <Teleport :to="toolbarTargetSelector || 'body'" :disabled="!toolbarTargetSelector">
      <div
        v-if="viewerSrc && !error"
        class="pdf-toolbar-wrap"
        :class="{ 'pdf-toolbar-wrap-embedded': !!toolbarTargetSelector }"
      >
        <div class="pdf-toolbar">
          <div class="pdf-toolbar-left">
            <div class="pdf-toolbar-group">
              <button
                class="pdf-toolbar-btn"
                :class="{ 'pdf-toolbar-btn-active': pdfUi.sidebarOpen }"
                :disabled="!pdfUi.ready"
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

    <div v-if="loading" class="flex items-center justify-center h-full text-sm"
         style="color: var(--fg-muted);">
      {{ t('Loading PDF...') }}
    </div>
    <div v-else-if="error" class="flex items-center justify-center h-full text-sm"
         style="color: var(--fg-muted);">
      {{ t('Could not load PDF') }}
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
import { useI18n } from '../../i18n'
import { usePdfTranslateStore } from '../../stores/pdfTranslate'
import { useToastStore } from '../../stores/toast'
import { useWorkspaceStore } from '../../stores/workspace'

const emit = defineEmits(['dblclick-page'])

const props = defineProps({
  filePath: { type: String, required: true },
  paneId:   { type: String, required: true },
  toolbarTargetSelector: { type: String, default: '' },
})

const PDF_VIEWER_OVERRIDE_STYLE_ID = 'altals-pdf-viewer-overrides'

const workspace = useWorkspaceStore()
const pdfTranslateStore = usePdfTranslateStore()
const toastStore = useToastStore()
const { t } = useI18n()
const iframeRef = ref(null)
const viewerSrc = ref(null)
const loading = ref(true)
const error = ref(null)
const searchInputRef = ref(null)
const pageInputRef = ref(null)
const pageInput = ref('1')
const scaleOptions = ref([])

const pdfUi = reactive({
  ready: false,
  pageNumber: 1,
  pagesCount: 0,
  canGoPrevious: false,
  canGoNext: false,
  canZoomOut: false,
  canZoomIn: false,
  scaleValue: 'auto',
  scaleLabel: t('Automatic Zoom'),
  sidebarOpen: false,
  searchOpen: false,
  searchQuery: '',
  searchResultText: '',
  searchHighlightAll: true,
  searchCaseSensitive: false,
  searchMatchDiacritics: false,
  searchEntireWord: false,
})

let syncTimer = null
let loadRequestId = 0
let iframeListenersAttached = false
let resolveViewerReady = null
let rejectViewerReady = null
let viewerReadyPromise = null

const LIGHT_THEMES = new Set(['light', 'one-light', 'humane', 'solarized'])
const isDark = computed(() => !LIGHT_THEMES.has(workspace.theme))
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

function localizeScaleLabel(label) {
  const normalized = String(label || '').trim()
  if (!normalized) return normalized
  if (normalized === 'Automatic Zoom') return t('Automatic Zoom')
  if (normalized === 'Actual Size') return t('Actual Size')
  if (normalized === 'Page Fit') return t('Page Fit')
  if (normalized === 'Page Width') return t('Page Width')
  return normalized
}

function resetPdfUi() {
  pdfUi.ready = false
  pdfUi.pageNumber = 1
  pdfUi.pagesCount = 0
  pdfUi.canGoPrevious = false
  pdfUi.canGoNext = false
  pdfUi.canZoomOut = false
  pdfUi.canZoomIn = false
  pdfUi.scaleValue = 'auto'
  pdfUi.scaleLabel = t('Automatic Zoom')
  pdfUi.sidebarOpen = false
  pdfUi.searchOpen = false
  pdfUi.searchQuery = ''
  pdfUi.searchResultText = ''
  pdfUi.searchHighlightAll = true
  pdfUi.searchCaseSensitive = false
  pdfUi.searchMatchDiacritics = false
  pdfUi.searchEntireWord = false
  pageInput.value = '1'
  scaleOptions.value = []
}

function clearSyncTimer() {
  if (syncTimer) {
    window.clearInterval(syncTimer)
    syncTimer = null
  }
}

function resetViewerReadyPromise() {
  viewerReadyPromise = new Promise((resolve, reject) => {
    resolveViewerReady = resolve
    rejectViewerReady = reject
  })
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
      label: localizeScaleLabel(option.textContent),
    }))
  const customOption = options.find(option => option.value === 'custom')
  if (customOption && customOption.label) return options
  return options.filter(option => option.value !== 'custom')
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
    pdfUi.scaleLabel = localizeScaleLabel(scaleSelect.options[scaleSelect.selectedIndex]?.textContent) || pdfUi.scaleLabel
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

function dispatchFind(type = '', findPrevious = false) {
  const app = getPdfApp()
  if (!app?.eventBus) return
  app.eventBus.dispatch('find', {
    source: app,
    type,
    query: pdfUi.searchQuery,
    caseSensitive: pdfUi.searchCaseSensitive,
    entireWord: pdfUi.searchEntireWord,
    highlightAll: pdfUi.searchHighlightAll,
    findPrevious,
    matchDiacritics: pdfUi.searchMatchDiacritics,
  })
}

function onSearchInput() {
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
  if (!win || !app) {
    rejectViewerReady?.(new Error('PDF viewer failed to initialize'))
    return
  }

  try {
    if (app.initializedPromise) {
      await app.initializedPromise
    }
  } catch (error) {
    rejectViewerReady?.(error)
    return
  }

  applyTheme()
  injectViewerOverrides()
  syncPdfUi()
  clearSyncTimer()
  syncTimer = window.setInterval(syncPdfUi, 250)

  if (!iframeListenersAttached) {
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
      iframeListenersAttached = true
    } catch {}
  }

  resolveViewerReady?.(app)
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
  const requestId = ++loadRequestId
  loading.value = true
  error.value = null
  clearSyncTimer()
  resetPdfUi()
  iframeListenersAttached = false

  try {
    const bytes = await invoke('read_file_binary', { path: props.filePath })
    if (requestId !== loadRequestId) return
    const uint8Array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    resetViewerReadyPromise()
    viewerSrc.value = `/pdfjs-viewer/web/viewer.html?instance=${requestId}`
    const app = await viewerReadyPromise
    if (requestId !== loadRequestId) return
    await app.open({ data: uint8Array })
    if (requestId !== loadRequestId) {
      await app.close().catch(() => {})
      return
    }
    syncPdfUi()
  } catch (e) {
    if (requestId !== loadRequestId) return
    error.value = e.toString()
  } finally {
    if (requestId === loadRequestId) {
      loading.value = false
    }
  }
}

function handlePdfUpdated(event) {
  if (event.detail?.path === props.filePath) loadPdf()
}

onMounted(() => {
  resetViewerReadyPromise()
  window.addEventListener('pdf-updated', handlePdfUpdated)
  loadPdf()
})

onUnmounted(() => {
  loadRequestId += 1
  window.removeEventListener('pdf-updated', handlePdfUpdated)
  clearSyncTimer()
  const app = getPdfApp()
  if (app?.close) {
    app.close().catch(() => {})
  }
  viewerReadyPromise = null
  resolveViewerReady = null
  rejectViewerReady = null
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
</style>
